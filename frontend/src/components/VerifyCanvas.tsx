import React, { useState, useEffect } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  VerificationStatus,
  VerificationRecord,
} from '@web-slinger/shared';
import { CodeBlock } from './CodeBlock.js';
import { EvidenceTrail, EvidenceItem } from './EvidenceTrail.js';
import { ManualHandoffCanvas } from './ManualHandoffCanvas.js';
import { saveVerificationRecords, getVerificationRecords } from '../api/sessions.js';

export interface VerificationRowData {
  id: 'format_check' | 'targeted_check' | 'manual_review' | 'contribution_guide';
  title: string;
  description: string;
  suggestedCommand: string;
  commandExplanation: string;
  status: VerificationStatus;
  userNotes: string;
}

const DEFAULT_VERIFICATION_ROWS: VerificationRowData[] = [
  {
    id: 'format_check',
    title: 'Format check',
    description: 'Ensure code and markdown styling, linting, and formatting conventions pass.',
    suggestedCommand: 'pnpm run lint',
    commandExplanation: 'Execute local formatting and lint checks in your workspace terminal.',
    status: 'not_run',
    userNotes: '',
  },
  {
    id: 'targeted_check',
    title: 'Targeted check',
    description: 'Run specific test suites or targeted tests covering modified files.',
    suggestedCommand: 'pnpm test',
    commandExplanation: 'Run local test suite and record observed passing/failing test results.',
    status: 'not_run',
    userNotes: '',
  },
  {
    id: 'manual_review',
    title: 'Manual review',
    description: 'Inspect modified files and diff in your editor against issue requirements.',
    suggestedCommand: 'git diff --stat && git status',
    commandExplanation: 'Inspect your local git working tree and modified files directly.',
    status: 'not_run',
    userNotes: '',
  },
  {
    id: 'contribution_guide',
    title: 'Contribution guide',
    description: 'Confirm branch naming, commit messages, and PR checklist comply with CONTRIBUTING.md.',
    suggestedCommand: 'git log -n 1 --oneline && git branch --show-current',
    commandExplanation: 'Check branch name and commit message format against repo guidelines.',
    status: 'not_run',
    userNotes: '',
  },
];

export interface VerifyCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  onPrepareHandoff?: () => void;
  onBackToDraft?: () => void;
  onReset?: () => void;
}

export const VerifyCanvas: React.FC<VerifyCanvasProps> = ({
  session,
  issue,
  onPrepareHandoff,
  onBackToDraft,
  onReset,
}) => {
  const [rows, setRows] = useState<VerificationRowData[]>(DEFAULT_VERIFICATION_ROWS);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isHandoffPrepared, setIsHandoffPrepared] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Attempt to restore any previously saved verification records on mount
  useEffect(() => {
    let isMounted = true;
    const loadSaved = async () => {
      try {
        const res = await getVerificationRecords(session.session_id, issue.number);
        if (isMounted && res.records && res.records.length > 0) {
          setRows((prev) =>
            prev.map((r) => {
              const matched = res.records.find((rec) => rec.checkId === r.id);
              if (matched) {
                return {
                  ...r,
                  status: matched.status,
                  userNotes: matched.userNotes || '',
                };
              }
              return r;
            })
          );
        }
      } catch {
        // First time entering verify; use default not_run rows
      }
    };
    loadSaved();
    return () => {
      isMounted = false;
    };
  }, [session.session_id, issue.number]);

  const handleStatusChange = (
    id: VerificationRowData['id'],
    newStatus: VerificationStatus
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
  };

  const handleNotesChange = (id: VerificationRowData['id'], notes: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, userNotes: notes } : r))
    );
  };

  // Condition: Primary action disabled until all 4 required rows have explicit statuses (none is 'not_run')
  const notRunCount = rows.filter((r) => r.status === 'not_run').length;
  const isHandoffReady = notRunCount === 0;

  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const blockedCount = rows.filter((r) => r.status === 'blocked').length;
  const hasBlockersOrFailures = failedCount > 0 || blockedCount > 0;

  // Build evidence trail from real saved sources and user-recorded checks
  const evidenceItems: EvidenceItem[] = [
    {
      type: 'issue',
      label: `Issue #${issue.number}`,
      detail: issue.title,
      url: issue.html_url || issue.source_url,
    },
    {
      type: 'guide',
      label: 'Contribution Guide',
      detail: 'Selected practice repository CONTRIBUTING.md checklist',
      url: issue.html_url
        ? `${issue.html_url.split('/issues/')[0]}/blob/main/CONTRIBUTING.md`
        : undefined,
    },
  ];

  // Add real user-recorded checks to evidence trail
  rows.forEach((r) => {
    if (r.status !== 'not_run') {
      evidenceItems.push({
        type: 'check',
        label: `${r.title}: ${r.status.toUpperCase()}`,
        detail: r.userNotes ? r.userNotes : `Recorded status: ${r.status}`,
      });
    }
  });

  const handlePrepareHandoff = async () => {
    if (!isHandoffReady) return;
    setIsSaving(true);
    setSaveError(null);

    const recordPayload: VerificationRecord[] = rows.map((r) => ({
      checkId: r.id,
      label: r.title,
      command: r.suggestedCommand,
      status: r.status,
      userNotes: r.userNotes || `Status recorded as ${r.status} by developer.`,
      recordedAt: new Date().toISOString(),
    }));

    try {
      await saveVerificationRecords(session.session_id, issue.number, recordPayload);
      if (onPrepareHandoff) {
        onPrepareHandoff();
      } else {
        setIsHandoffPrepared(true);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to save verification records.';
      setSaveError(msg);
      // Still allow viewing the prepared package locally
      if (onPrepareHandoff) {
        onPrepareHandoff();
      } else {
        setIsHandoffPrepared(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ws-page-canvas ws-verify-canvas" role="region" aria-label="Verify Stage">
      {/* 1. Header & Supporting text */}
      <div className="ws-title-group">
        <h1 className="ws-prompt-heading">Check your work before you share it.</h1>
        <p className="ws-prompt-description">
          Web-Slinger did not run these checks. Record only what you saw in your own workspace.
        </p>
      </div>

      {/* 2. Compact selected-issue panel */}
      <div className="ws-card ws-verify-selected-panel" role="region" aria-label="Selected issue panel">
        <div className="ws-verify-issue-content">
          <div className="ws-verify-issue-header-row">
            <span className="ws-chip ws-badge-primary">Selected practice repository</span>
            <a
              href={issue.html_url || issue.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ws-source-link"
              aria-label={`Open issue #${issue.number} on GitHub`}
            >
              View issue on GitHub ↗
            </a>
          </div>
          <h2 className="ws-verify-issue-title">
            #{issue.number} {issue.title}
          </h2>
        </div>
      </div>

      {/* Visible explanation for Failed / Blocked checks */}
      {hasBlockersOrFailures && (
        <div className="ws-workbench-notice ws-notice-warning" role="note" aria-live="polite">
          <span className="ws-workbench-notice-icon">⚠</span>
          <div className="ws-workbench-notice-content">
            <strong>
              Notice: {failedCount > 0 ? `${failedCount} check(s) marked as Failed` : ''}
              {failedCount > 0 && blockedCount > 0 ? ' and ' : ''}
              {blockedCount > 0 ? `${blockedCount} check(s) marked as Blocked` : ''}
            </strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Web-Slinger keeps all failed and blocked observations clearly visible. Your manual handoff
              package will document these observations so maintainers understand your exact workspace status.
            </p>
          </div>
        </div>
      )}

      {/* 3. Four user-facing verification rows */}
      <div className="ws-verification-rows-container">
        {rows.map((row) => {
          const isFailed = row.status === 'failed';
          const isBlocked = row.status === 'blocked';

          return (
            <div
              key={row.id}
              className={`ws-card ws-verification-row-card ${
                isFailed ? 'ws-row-card-failed' : isBlocked ? 'ws-row-card-blocked' : ''
              }`}
              data-testid={`verify-row-${row.id}`}
            >
              <div className="ws-verification-card-header">
                <div className="ws-verify-row-title-wrap">
                  <span className="ws-checklist-item-title">{row.title}</span>
                  <p className="ws-verify-row-desc">{row.description}</p>
                </div>
                <span className={`ws-chip ws-badge-${row.status.replace('_', '-')}`}>
                  {row.status.toUpperCase().replace('_', ' ')}
                </span>
              </div>

              {/* Expandable Details area using CodeBlock to keep raw commands hidden */}
              <details className="ws-details-section">
                <summary className="ws-details-summary">Suggested Command & Details</summary>
                <div className="ws-details-content">
                  <CodeBlock
                    code={row.suggestedCommand}
                    language="Shell"
                    explanation={row.commandExplanation}
                  />
                </div>
              </details>

              {/* Plain explanation callouts for failed or blocked rows */}
              {isFailed && (
                <div className="ws-status-callout ws-callout-failed" role="note">
                  ✕ <strong>Marked as Failed:</strong> Note down the test failure or formatting mismatch in the field below.
                </div>
              )}
              {isBlocked && (
                <div className="ws-status-callout ws-callout-blocked" role="note">
                  ⚠ <strong>Marked as Blocked:</strong> Note down what blocked execution (e.g. missing environment setup).
                </div>
              )}

              {/* Status Selector */}
              <div className="ws-verification-field-group">
                <label className="ws-field-label">Verification Status</label>
                <div
                  className="ws-status-selector"
                  role="radiogroup"
                  aria-label={`Status for ${row.title}`}
                >
                  {(['passed', 'failed', 'blocked', 'not_run'] as VerificationStatus[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        className={`ws-status-btn ws-status-btn-${st.replace('_', '-')} ${
                          row.status === st ? 'ws-status-btn-selected' : ''
                        }`}
                        onClick={() => handleStatusChange(row.id, st)}
                        aria-pressed={row.status === st}
                        aria-label={`Set status of ${row.title} to ${st.replace('_', ' ')}`}
                      >
                        {st === 'passed' && '✓ Passed'}
                        {st === 'failed' && '✕ Failed'}
                        {st === 'blocked' && '⚠ Blocked'}
                        {st === 'not_run' && '○ Not run'}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Short Note Field */}
              <div className="ws-verification-field-group">
                <label className="ws-field-label" htmlFor={`notes-${row.id}`}>
                  Verification Note
                </label>
                <textarea
                  id={`notes-${row.id}`}
                  className="ws-notes-textarea"
                  value={row.userNotes}
                  onChange={(e) => handleNotesChange(row.id, e.target.value)}
                  placeholder={
                    row.status === 'not_run'
                      ? 'No notes yet. Select a status and record what you observed.'
                      : 'Describe what you saw in your terminal or editor...'
                  }
                  rows={2}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Small Evidence Trail using real saved sources and user-recorded checks */}
      <EvidenceTrail items={evidenceItems} title="Verified Evidence Trail" />

      {/* Error feedback if saving fails */}
      {saveError && (
        <div className="ws-error-card" role="alert">
          <div className="ws-error-title">Verification notice</div>
          <p className="ws-error-body">{saveError}</p>
        </div>
      )}

      {/* 5. Prepared Manual Handoff View (Displayed when developer prepares handoff) */}
      {isHandoffPrepared ? (
        <ManualHandoffCanvas
          session={session}
          issue={issue}
          initialRecords={rows.map((r) => ({
            checkId: r.id,
            label: r.title,
            command: r.suggestedCommand,
            status: r.status,
            userNotes: r.userNotes,
            recordedAt: new Date().toISOString(),
          }))}
          onBackToVerify={() => setIsHandoffPrepared(false)}
          onBackToDraft={onBackToDraft}
          onReset={onReset}
        />
      ) : (
        /* 6. Primary Action Button Area */
        <div className="ws-verify-action-area">
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              disabled={!isHandoffReady || isSaving}
              onClick={handlePrepareHandoff}
              aria-label="Prepare my manual handoff"
            >
              {isSaving ? 'Preparing handoff...' : 'Prepare my manual handoff'}
            </button>

            {onBackToDraft && (
              <button
                type="button"
                className="ws-button-secondary"
                onClick={onBackToDraft}
              >
                ← Back to Draft
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

          {!isHandoffReady && (
            <p className="ws-verify-helper-hint" role="status">
              Complete all 4 verification rows (choose Passed, Failed, or Blocked) to prepare manual handoff. ({notRunCount} remaining)
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VerifyCanvas;
