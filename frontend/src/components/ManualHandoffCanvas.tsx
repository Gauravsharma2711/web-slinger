/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  VerificationRecord,
  ProofReceiptResponse,
} from '@web-slinger/shared';
import { CodeBlock } from './CodeBlock.js';
import { getVerificationRecords, getProofReceipt, getPatchDraft } from '../api/sessions.js';

export interface ManualHandoffCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  initialRecords?: VerificationRecord[];
  onBackToVerify?: () => void;
  onBackToDraft?: () => void;
  onReset?: () => void;
}

export const ManualHandoffCanvas: React.FC<ManualHandoffCanvasProps> = ({
  session,
  issue,
  initialRecords,
  onBackToVerify,
  onBackToDraft,
  onReset,
}) => {
  const [verificationRecords, setVerificationRecords] = useState<VerificationRecord[]>(
    initialRecords || []
  );
  const [patchSummary, setPatchSummary] = useState<{ changedFiles: string[]; totalLines: number } | null>(null);
  const [proofReceipt, setProofReceipt] = useState<ProofReceiptResponse | null>(null);

  // Editable PR draft state
  const defaultPrTitle = `fix: update issue #${issue.number} ${issue.title.toLowerCase().replace(/^(fix|bug|feat):\s*/i, '')}`;
  const [prTitle, setPrTitle] = useState<string>(defaultPrTitle);
  const [prBody, setPrBody] = useState<string>('');

  // Branch name state
  const defaultBranchName = `fix/issue-${issue.number}`;
  const [branchName, setBranchName] = useState<string>(defaultBranchName);

  // Notification feedback state
  const [copiedAction, setCopiedAction] = useState<string | null>(null);

  const showCopyFeedback = (msg: string) => {
    setCopiedAction(msg);
    setTimeout(() => setCopiedAction(null), 3000);
  };

  // Load saved verification records, patch summary, and receipt on mount
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        // 1. Verification records
        let records: VerificationRecord[] = initialRecords || [];
        if (records.length === 0) {
          try {
            const recRes = await getVerificationRecords(session.session_id, issue.number);
            if (recRes && recRes.records && recRes.records.length > 0) {
              records = recRes.records;
              if (isMounted) setVerificationRecords(records);
            }
          } catch {
            // No records yet
          }
        }

        // 2. Patch draft
        try {
          if (session.snapshot_id) {
            const patchRes = await getPatchDraft(session.session_id, issue.number, session.snapshot_id);
            if (isMounted && patchRes) {
              setPatchSummary({
                changedFiles: patchRes.changed_files || [],
                totalLines: patchRes.total_changed_lines || 0,
              });
            }
          }
        } catch {
          // No patch loaded
        }

        // 3. Proof receipt
        try {
          const receiptRes = await getProofReceipt(session.session_id, issue.number);
          if (isMounted && receiptRes) {
            setProofReceipt(receiptRes);
          }
        } catch {
          // No receipt yet
        }

        // Generate initial PR body template with mandatory "Related to #<issue number>"
        const initialBody = [
          '## Summary',
          `Manual fix prepared for issue #${issue.number} (${issue.title}).`,
          '',
          '## Related issue',
          `Related to #${issue.number}`,
          '',
          '## What I checked',
          ...records.map(
            (r) =>
              `- [${r.status === 'passed' ? 'x' : ' '}] **${r.label}** (${r.status.toUpperCase()})${
                r.userNotes ? `: ${r.userNotes}` : ''
              }`
          ),
          ...(records.length === 0
            ? ['- [x] Manual review: Inspected code changes locally.']
            : []),
          '',
          '## Notes for maintainers',
          'All verification checks were run locally in personal development workspace. Web-Slinger does not execute automated GitHub write actions or automated PR submissions.',
        ].join('\n');

        if (isMounted) {
          setPrBody(initialBody);
        }
      } catch {
        // Ignored
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [session.session_id, session.snapshot_id, issue.number, issue.title, initialRecords]);

  // Evaluate readiness
  const failedRecords = verificationRecords.filter((r) => r.status === 'failed');
  const blockedRecords = verificationRecords.filter((r) => r.status === 'blocked');
  const notRunRecords = verificationRecords.filter((r) => r.status === 'not_run');
  const passedRecords = verificationRecords.filter((r) => r.status === 'passed');

  const needsAttention =
    failedRecords.length > 0 ||
    blockedRecords.length > 0 ||
    notRunRecords.length > 0 ||
    verificationRecords.length === 0;

  const isReady = !needsAttention;

  // URLs
  const issueUrl = issue.html_url || issue.source_url || `https://github.com/freeCodeCamp/freeCodeCamp/issues/${issue.number}`;
  const repoParts = issue.html_url?.split('/') || [];
  const owner = repoParts[3] || 'freeCodeCamp';
  const repo = repoParts[4] || 'freeCodeCamp';
  const forkUrl = `https://github.com/${owner}/${repo}/fork`;

  // Git manual commands
  const gitCommandsText = [
    `# 1. Check workspace status`,
    `git status`,
    ``,
    `# 2. Verify whitespace and diff check`,
    `git diff --check`,
    ``,
    `# 3. Stage verified changes`,
    `git add .`,
    ``,
    `# 4. Commit with conventional commit message`,
    `git commit -m "${prTitle || `fix: resolve issue #${issue.number}`}"`,
    ``,
    `# 5. Push branch to personal fork`,
    `git push -u origin ${branchName || defaultBranchName}`,
  ].join('\n');

  // Copy helpers
  const handleCopyText = async (text: string, successLabel: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showCopyFeedback(successLabel);
    } catch {
      showCopyFeedback('Failed to copy to clipboard');
    }
  };

  const handleCopyHandoffChecklist = () => {
    const checklist = [
      `# Manual Handoff Checklist for Issue #${issue.number}`,
      `**Repository:** ${owner}/${repo} (Selected practice repository)`,
      `**Issue:** #${issue.number} ${issue.title}`,
      `**Issue URL:** ${issueUrl}`,
      `**Branch:** ${branchName}`,
      '',
      '## Readiness Status',
      isReady ? '✓ READY FOR MANUAL HANDOFF' : '⚠ NEEDS ATTENTION',
      '',
      '## Verification Checks',
      ...verificationRecords.map(
        (r) => `- **${r.label}**: ${r.status.toUpperCase()} (${r.userNotes || 'No notes'})`
      ),
      '',
      '## Proposed PR Title',
      prTitle,
      '',
      '## Proposed PR Body',
      prBody,
    ].join('\n');

    handleCopyText(checklist, 'Copied handoff checklist to clipboard!');
  };

  const handleCopyPrDraft = () => {
    const draftText = `Title:\n${prTitle}\n\nBody:\n${prBody}`;
    handleCopyText(draftText, 'Copied PR draft to clipboard!');
  };

  const handleCopyGitCommands = () => {
    handleCopyText(gitCommandsText, 'Copied Git commands to clipboard!');
  };

  const handleDownloadReceipt = () => {
    const receiptData = proofReceipt || {
      session_id: session.session_id,
      issue_number: issue.number,
      repository: `${owner}/${repo}`,
      branch_name: branchName,
      pr_title: prTitle,
      verification_records: verificationRecords,
      readiness_status: isReady ? 'ready_for_manual_handoff' : 'needs_attention',
      created_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(receiptData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `proof-receipt-issue-${issue.number}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showCopyFeedback('Downloaded proof receipt (.json)!');
  };

  return (
    <div className="ws-page-canvas ws-handoff-canvas" role="region" aria-label="Manual Handoff Stage">
      {/* 1. Heading */}
      <div className="ws-title-group">
        <h1 className="ws-prompt-heading">You are in control of the final step.</h1>
        <p className="ws-prompt-description">
          Prepare your pull request draft, copy manual Git commands, and review your verified evidence before sharing.
        </p>
      </div>

      {/* 2. Mandatory Exact Notice */}
      <div className="ws-workbench-notice" role="note" aria-label="Manual handoff disclaimer">
        <span className="ws-workbench-notice-icon">ℹ</span>
        <p className="ws-workbench-notice-text">
          Web-Slinger has not pushed your branch or created a pull request. Review the diff, then use your own Git and GitHub account if you decide to share it.
        </p>
      </div>

      {/* Feedback banner */}
      {copiedAction && (
        <div className="ws-success-banner" role="status" aria-live="polite">
          ✓ {copiedAction}
        </div>
      )}

      {/* 3. Concise Readiness Summary */}
      <div className="ws-card ws-readiness-summary-card" role="region" aria-label="Readiness summary">
        <div className="ws-readiness-summary-header">
          <div className="ws-readiness-title-row">
            <span className="ws-chip ws-badge-primary">Selected practice repository</span>
            <span
              className={`ws-chip ${
                isReady ? 'ws-badge-passed' : 'ws-badge-blocked'
              }`}
              style={{ fontWeight: 700 }}
            >
              READINESS: {isReady ? 'READY FOR MANUAL HANDOFF' : 'NEEDS ATTENTION'}
            </span>
          </div>
          <h2 className="ws-verify-issue-title" style={{ marginTop: 'var(--ws-space-2)' }}>
            #{issue.number} {issue.title}
          </h2>
        </div>

        <div className="ws-readiness-details-grid">
          <div className="ws-readiness-grid-cell">
            <span className="ws-receipt-label">Selected Issue</span>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ws-source-link"
              aria-label={`Open issue #${issue.number} on GitHub`}
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
            >
              Issue #{issue.number} on GitHub ↗
            </a>
          </div>

          <div className="ws-readiness-grid-cell">
            <span className="ws-receipt-label">Reviewed Patch</span>
            <span className="ws-receipt-value" style={{ marginTop: '4px' }}>
              {patchSummary
                ? `${patchSummary.changedFiles.length} file(s), ${patchSummary.totalLines} lines modified`
                : 'Minimal draft patch reviewed'}
            </span>
          </div>

          <div className="ws-readiness-grid-cell" style={{ gridColumn: '1 / -1' }}>
            <span className="ws-receipt-label">User-Recorded Check Results</span>
            <div className="ws-readiness-chips-row" style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="ws-chip ws-badge-passed">Passed: {passedRecords.length}</span>
              <span className="ws-chip ws-badge-failed">Failed: {failedRecords.length}</span>
              <span className="ws-chip ws-badge-blocked">Blocked: {blockedRecords.length}</span>
              {notRunRecords.length > 0 && (
                <span className="ws-chip ws-badge-not-run">Not Run: {notRunRecords.length}</span>
              )}
            </div>
          </div>
        </div>

        {/* Attention Details: Show EXACTLY which check needs attention */}
        {needsAttention && (
          <div className="ws-status-callout ws-callout-blocked" role="alert" style={{ marginTop: 'var(--ws-space-3)' }}>
            <strong>⚠ Attention Required Before Handoff:</strong>
            <p style={{ margin: '4px 0 6px 0' }}>
              Do not hide failures or treat this work as complete. The following user-recorded check(s) need attention:
            </p>
            <ul style={{ margin: '0', paddingLeft: '20px' }}>
              {failedRecords.map((r) => (
                <li key={r.checkId}>
                  <strong>{r.label}</strong> (FAILED): {r.userNotes || 'Marked as failed during workspace check.'}
                </li>
              ))}
              {blockedRecords.map((r) => (
                <li key={r.checkId}>
                  <strong>{r.label}</strong> (BLOCKED): {r.userNotes || 'Marked as blocked during workspace check.'}
                </li>
              ))}
              {notRunRecords.map((r) => (
                <li key={r.checkId}>
                  <strong>{r.label}</strong> (NOT RUN): Check has not been evaluated in local workspace.
                </li>
              ))}
              {verificationRecords.length === 0 && (
                <li>No verification records found. Return to Verify screen to record your local observations.</li>
              )}
            </ul>
          </div>
        )}

        {/* 4. Primary Action if Ready */}
        {isReady && (
          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-4)' }}>
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleCopyHandoffChecklist}
              aria-label="Copy my handoff checklist"
            >
              Copy my handoff checklist
            </button>
          </div>
        )}
      </div>

      {/* 5. Simple Editable PR Title & Body Draft */}
      <div className="ws-card ws-pr-draft-card" role="region" aria-label="PR draft editor">
        <div className="ws-card-header-row">
          <h3 className="ws-section-title" style={{ margin: 0 }}>
            Pull Request Draft
          </h3>
          <span className="ws-chip ws-badge-primary">Markdown Template</span>
        </div>

        <div className="ws-verification-field-group" style={{ marginTop: 'var(--ws-space-3)' }}>
          <label className="ws-field-label" htmlFor="pr-title-input">
            Pull Request Title
          </label>
          <input
            id="pr-title-input"
            type="text"
            className="ws-input-text"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            placeholder="e.g. fix(curriculum): update fs module lesson phrasing"
          />
        </div>

        <div className="ws-verification-field-group" style={{ marginTop: 'var(--ws-space-3)' }}>
          <label className="ws-field-label" htmlFor="pr-body-input">
            Pull Request Description (Editable)
          </label>
          <textarea
            id="pr-body-input"
            className="ws-notes-textarea"
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            rows={10}
            style={{ fontFamily: 'var(--ws-font-mono)', fontSize: '13px', lineHeight: 1.5 }}
          />
          <span className="ws-field-hint" style={{ fontSize: '12px', color: 'var(--ws-muted)' }}>
            Includes sections: <code>Summary</code>, <code>Related issue</code> (defaulting to <code>Related to #{issue.number}</code>), <code>What I checked</code>, and <code>Notes for maintainers</code>.
          </span>
        </div>

        <div className="ws-actions" style={{ marginTop: 'var(--ws-space-3)' }}>
          <button
            type="button"
            className="ws-button-secondary"
            onClick={handleCopyPrDraft}
            aria-label="Copy PR draft"
          >
            Copy PR draft
          </button>
        </div>
      </div>

      {/* 6. Git Commands Using CodeBlock */}
      <div className="ws-card ws-git-commands-card" role="region" aria-label="Manual Git commands">
        <div className="ws-card-header-row">
          <h3 className="ws-section-title" style={{ margin: 0 }}>
            Manual Git Commands
          </h3>
          <span className="ws-chip ws-badge-primary">Local Terminal</span>
        </div>
        <p className="ws-verify-row-desc" style={{ marginTop: '4px' }}>
          Execute these standard manual Git commands one-by-one in your local repository checkout.
        </p>

        <div className="ws-verification-field-group" style={{ marginTop: 'var(--ws-space-3)' }}>
          <label className="ws-field-label" htmlFor="branch-name-input">
            Target Branch Name
          </label>
          <input
            id="branch-name-input"
            type="text"
            className="ws-input-text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="e.g. fix/issue-69622"
          />
        </div>

        <div className="ws-git-commands-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-3)', marginTop: 'var(--ws-space-3)' }}>
          {/* Command 1: git status */}
          <div className="ws-git-command-step">
            <span className="ws-git-step-num">1</span>
            <div style={{ flex: 1 }}>
              <CodeBlock
                code="git status"
                language="Bash"
                explanation="Check the working tree and see modified files in your local branch."
              />
            </div>
          </div>

          {/* Command 2: git diff --check */}
          <div className="ws-git-command-step">
            <span className="ws-git-step-num">2</span>
            <div style={{ flex: 1 }}>
              <CodeBlock
                code="git diff --check"
                language="Bash"
                explanation="Inspect the diff and verify there are no whitespace or syntax errors."
              />
            </div>
          </div>

          {/* Command 3: git add */}
          <div className="ws-git-command-step">
            <span className="ws-git-step-num">3</span>
            <div style={{ flex: 1 }}>
              <CodeBlock
                code="git add ."
                language="Bash"
                explanation="Stage the reviewed file changes for commit."
              />
            </div>
          </div>

          {/* Command 4: git commit */}
          <div className="ws-git-command-step">
            <span className="ws-git-step-num">4</span>
            <div style={{ flex: 1 }}>
              <CodeBlock
                code={`git commit -m "${prTitle || `fix: update issue #${issue.number}`}"`}
                language="Bash"
                explanation="Create a commit with a clear, conventional commit message."
              />
            </div>
          </div>

          {/* Command 5: git push */}
          <div className="ws-git-command-step">
            <span className="ws-git-step-num">5</span>
            <div style={{ flex: 1 }}>
              <CodeBlock
                code={`git push -u origin ${branchName || defaultBranchName}`}
                language="Bash"
                explanation="Push your local branch to your personal fork on GitHub."
              />
            </div>
          </div>
        </div>

        <div className="ws-actions" style={{ marginTop: 'var(--ws-space-4)' }}>
          <button
            type="button"
            className="ws-button-secondary"
            onClick={handleCopyGitCommands}
            aria-label="Copy commands"
          >
            Copy commands
          </button>
        </div>
      </div>

      {/* 7. Allowed Action Cluster */}
      <div className="ws-card ws-actions-cluster-card" role="region" aria-label="Handoff actions">
        <h3 className="ws-section-title" style={{ margin: 0, marginBottom: 'var(--ws-space-3)' }}>
          Handoff Actions & External Links
        </h3>

        <div className="ws-actions">
          <button
            type="button"
            className="ws-button-secondary"
            onClick={handleCopyGitCommands}
            aria-label="Copy commands"
          >
            Copy commands
          </button>

          <button
            type="button"
            className="ws-button-secondary"
            onClick={handleCopyPrDraft}
            aria-label="Copy PR draft"
          >
            Copy PR draft
          </button>

          <a
            href={forkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ws-source-link"
            aria-label="Open my fork"
          >
            Open my fork ↗
          </a>

          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ws-source-link"
            aria-label="Open upstream issue"
          >
            Open upstream issue ↗
          </a>

          <button
            type="button"
            className="ws-button-secondary"
            onClick={handleDownloadReceipt}
            aria-label="Download proof receipt"
          >
            Download proof receipt (.json)
          </button>

          {onBackToVerify && (
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToVerify}
            >
              ← Edit verification checks
            </button>
          )}

          {onBackToDraft && (
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToDraft}
            >
              ← Back to draft patch
            </button>
          )}

          {onReset && (
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onReset}
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualHandoffCanvas;
