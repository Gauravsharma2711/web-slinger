/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  WorkPlanResponse,
  PatchDraftResponse,
  VerificationPlanResponse,
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_VERIFICATION_DISCLAIMER,
} from '@web-slinger/shared';
import {
  getWorkPlan,
  generateWorkPlan,
  generatePatchDraft,
  updatePatchDraft,
  generateVerificationPlan,
} from '../api/sessions.js';

export type WorkbenchStep = 'plan' | 'sources' | 'patch' | 'verification';

export interface WorkbenchCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  initialStep?: WorkbenchStep;
  onBackToBrief: () => void;
  onReset: () => void;
}

export const WorkbenchCanvas: React.FC<WorkbenchCanvasProps> = ({
  session,
  issue,
  initialStep = 'plan',
  onBackToBrief,
  onReset,
}) => {
  const [currentStep, setCurrentStep] = useState<WorkbenchStep>(initialStep);

  // Work Plan state
  const [workPlan, setWorkPlan] = useState<WorkPlanResponse | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);

  // Source Review state
  const [reviewedFilesState, setReviewedFilesState] = useState<Record<string, boolean>>({});
  const [hasAffirmed, setHasAffirmed] = useState<boolean>(false);

  // Patch Draft state
  const [patchDraft, setPatchDraft] = useState<PatchDraftResponse | null>(null);
  const [editableDiff, setEditableDiff] = useState<string>('');
  const [isPatchLoading, setIsPatchLoading] = useState<boolean>(false);
  const [isPatchSaving, setIsPatchSaving] = useState<boolean>(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [copyPatchStatus, setCopyPatchStatus] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Verification Plan state
  const [verificationPlan, setVerificationPlan] = useState<VerificationPlanResponse | null>(null);
  const [isVPlanLoading, setIsVPlanLoading] = useState<boolean>(false);
  const [vPlanError, setVPlanError] = useState<string | null>(null);
  const [copyChecklistStatus, setCopyChecklistStatus] = useState<string | null>(null);

  const hasRequestedPlanRef = useRef<boolean>(false);

  // Load or generate work plan on mount
  const loadOrGenerateWorkPlan = useCallback(
    async (force = false) => {
      setIsPlanLoading(true);
      setPlanError(null);

      try {
        if (!force) {
          try {
            const existing = await getWorkPlan(session.session_id, issue.number);
            if (existing && existing.status) {
              setWorkPlan(existing);
              setIsPlanLoading(false);
              return;
            }
          } catch {
            // Not yet generated; proceed to generate
          }
        }

        const generated = await generateWorkPlan(session.session_id, issue.number);
        setWorkPlan(generated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to generate work plan';
        setPlanError(msg);
      } finally {
        setIsPlanLoading(false);
      }
    },
    [session.session_id, issue.number]
  );

  useEffect(() => {
    if (!hasRequestedPlanRef.current) {
      hasRequestedPlanRef.current = true;
      loadOrGenerateWorkPlan(false);
    }
  }, [loadOrGenerateWorkPlan]);

  // Sync reviewed files checkboxes when workPlan loads
  useEffect(() => {
    if (workPlan?.file_evidence) {
      setReviewedFilesState((prev) => {
        const next = { ...prev };
        for (const file of workPlan.file_evidence) {
          if (next[file.path] === undefined) {
            next[file.path] = false;
          }
        }
        return next;
      });
    }
  }, [workPlan]);

  // Compute if all required source files are checked
  const allSourcesChecked =
    workPlan?.file_evidence && workPlan.file_evidence.length > 0
      ? workPlan.file_evidence.every((f) => reviewedFilesState[f.path] === true)
      : false;

  const canGeneratePatch = allSourcesChecked && hasAffirmed;

  // Generate patch draft
  const handleGeneratePatch = async () => {
    if (!canGeneratePatch || !workPlan?.file_evidence) return;

    setIsPatchLoading(true);
    setPatchError(null);

    const reviewedSources = workPlan.file_evidence.map((f) => ({
      path: f.path,
      sha: f.sha,
    }));

    try {
      const draft = await generatePatchDraft(session.session_id, issue.number, {
        reviewedSources,
        userAffirmation: true,
      });

      setPatchDraft(draft);
      setEditableDiff(draft.diff_content);
      setCurrentStep('patch');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate patch draft';
      setPatchError(msg);
    } finally {
      setIsPatchLoading(false);
    }
  };

  // Save user-edited patch draft via PUT
  const handleSavePatchDraft = async () => {
    if (!patchDraft) return;

    setIsPatchSaving(true);
    setSaveSuccessMessage(null);
    setPatchError(null);

    try {
      const updated = await updatePatchDraft(
        session.session_id,
        issue.number,
        patchDraft.patch_id,
        editableDiff
      );
      setPatchDraft(updated);
      setSaveSuccessMessage('Draft saved successfully to your session record.');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save patch draft';
      setPatchError(msg);
    } finally {
      setIsPatchSaving(false);
    }
  };

  // Copy patch to clipboard
  const handleCopyPatch = async () => {
    try {
      await navigator.clipboard.writeText(editableDiff);
      setCopyPatchStatus('Patch copied to clipboard!');
      setTimeout(() => setCopyPatchStatus(null), 3000);
    } catch {
      setCopyPatchStatus('Failed to copy to clipboard');
      setTimeout(() => setCopyPatchStatus(null), 3000);
    }
  };

  // Download .patch file
  const handleDownloadPatch = () => {
    const blob = new Blob([editableDiff], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `issue-${issue.number}-contribution.patch`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate verification plan
  const handleLoadVerificationPlan = async () => {
    setCurrentStep('verification');
    if (verificationPlan) return;

    setIsVPlanLoading(true);
    setVPlanError(null);

    try {
      const plan = await generateVerificationPlan(session.session_id, issue.number);
      setVerificationPlan(plan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate verification checklist';
      setVPlanError(msg);
    } finally {
      setIsVPlanLoading(false);
    }
  };

  // Copy verification checklist
  const handleCopyChecklist = async () => {
    if (!verificationPlan?.plan?.checklist) return;

    const markdownChecklist = [
      `# Manual Verification Checklist for Issue #${issue.number}`,
      `> ${MANDATORY_VERIFICATION_DISCLAIMER}`,
      '',
      ...verificationPlan.plan.checklist.map(
        (item) =>
          `- [ ] **${item.title}**\n  ${item.description}${
            item.suggestedCommand ? `\n  \`${item.suggestedCommand}\`` : ''
          }`
      ),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(markdownChecklist);
      setCopyChecklistStatus('Checklist copied as Markdown!');
      setTimeout(() => setCopyChecklistStatus(null), 3000);
    } catch {
      setCopyChecklistStatus('Failed to copy to clipboard');
      setTimeout(() => setCopyChecklistStatus(null), 3000);
    }
  };

  const isFixture = workPlan?.is_fixture || patchDraft?.is_fixture || issue.is_fixture;

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <button
            type="button"
            className="ws-back-button"
            onClick={onBackToBrief}
            aria-label="Back to context brief"
          >
            ← Back to context brief
          </button>
          <div className="ws-stack-chips">
            {session.stack.map((item) => (
              <span key={item} className="ws-chip">
                {item}
              </span>
            ))}
          </div>
        </div>
        <span className="ws-session-indicator">
          SESSION ACTIVE • ID: {session.session_id.slice(0, 8)}... • 24H TTL
        </span>
      </div>

      {/* Workbench Navigation Progress Rail */}
      <nav className="ws-workbench-nav" aria-label="Workbench Steps">
        <div className="ws-workbench-tabs">
          <button
            type="button"
            className={`ws-tab-button ${currentStep === 'plan' ? 'ws-tab-active' : ''}`}
            onClick={() => setCurrentStep('plan')}
            aria-current={currentStep === 'plan' ? 'step' : undefined}
          >
            <span className="ws-tab-number">1</span>
            <span className="ws-tab-label">Work Plan</span>
          </button>
          <button
            type="button"
            className={`ws-tab-button ${currentStep === 'sources' ? 'ws-tab-active' : ''}`}
            onClick={() => setCurrentStep('sources')}
            aria-current={currentStep === 'sources' ? 'step' : undefined}
          >
            <span className="ws-tab-number">2</span>
            <span className="ws-tab-label">Source Review</span>
          </button>
          <button
            type="button"
            className={`ws-tab-button ${currentStep === 'patch' ? 'ws-tab-active' : ''}`}
            onClick={() => setCurrentStep('patch')}
            aria-current={currentStep === 'patch' ? 'step' : undefined}
            disabled={!patchDraft}
          >
            <span className="ws-tab-number">3</span>
            <span className="ws-tab-label">Patch Review</span>
          </button>
          <button
            type="button"
            className={`ws-tab-button ${currentStep === 'verification' ? 'ws-tab-active' : ''}`}
            onClick={handleLoadVerificationPlan}
            aria-current={currentStep === 'verification' ? 'step' : undefined}
          >
            <span className="ws-tab-number">4</span>
            <span className="ws-tab-label">Verification Prep</span>
          </button>
        </div>
      </nav>

      {/* Issue Identity Header */}
      <div className="ws-workbench-header">
        <div className="ws-evidence-badge-container">
          <span className="ws-evidence-badge">
            <span className="ws-evidence-dot" />
            EVIDENCE-GROUNDED WORKBENCH
          </span>
          {isFixture && (
            <span className="ws-chip" style={{ borderColor: 'var(--ws-accent-teal)' }}>
              DEMO FIXTURE
            </span>
          )}
        </div>
        <h1 className="ws-page-title" style={{ fontSize: 'var(--ws-font-size-2xl)' }}>
          #{issue.number}: {issue.title}
        </h1>
      </div>

      {/* STEP 1: WORK PLAN */}
      {currentStep === 'plan' && (
        <div className="ws-workbench-step-content" id="step-work-plan">
          {isPlanLoading ? (
            <div className="ws-loading-container" role="status">
              <div className="ws-spinner" />
              <p className="ws-loading-text">
                Synthesizing evidence-grounded contribution work plan...
              </p>
            </div>
          ) : planError ? (
            <div className="ws-error-container" role="alert">
              <p className="ws-error-title">Unable to generate work plan</p>
              <p className="ws-error-message">{planError}</p>
              <button
                type="button"
                className="ws-button-primary"
                onClick={() => loadOrGenerateWorkPlan(true)}
              >
                Retry generation
              </button>
            </div>
          ) : workPlan?.plan ? (
            <div className="ws-workbench-sections">
              {/* Confirmed Problem */}
              <section className="ws-section" aria-labelledby="heading-confirmed-problem">
                <h2 id="heading-confirmed-problem" className="ws-section-title">
                  1. Confirmed Problem
                </h2>
                <div className="ws-card">
                  <p className="ws-paragraph">{workPlan.plan.confirmedProblem}</p>
                </div>
              </section>

              {/* Candidate & Confirmed Files */}
              <section className="ws-section" aria-labelledby="heading-candidate-files">
                <h2 id="heading-candidate-files" className="ws-section-title">
                  2. Candidate & Reviewed Files
                </h2>
                <div className="ws-candidate-files-list">
                  {workPlan.plan.candidateFiles.map((file) => (
                    <div key={file.path} className="ws-card ws-candidate-file-card">
                      <div className="ws-file-header">
                        <span className="ws-file-path">{file.path}</span>
                        <span
                          className={`ws-chip ${
                            file.confidence === 'confirmed'
                              ? 'ws-badge-confirmed'
                              : 'ws-badge-candidate'
                          }`}
                        >
                          {file.confidence.toUpperCase()}
                        </span>
                      </div>
                      <p className="ws-file-rationale">{file.rationale}</p>
                      {file.evidenceUrls && file.evidenceUrls.length > 0 && (
                        <div className="ws-file-links">
                          {file.evidenceUrls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ws-source-link"
                            >
                              Source Evidence ↗
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Smallest Change Plan */}
              <section className="ws-section" aria-labelledby="heading-smallest-change">
                <h2 id="heading-smallest-change" className="ws-section-title">
                  3. Smallest Change Plan
                </h2>
                <div className="ws-card">
                  <ol className="ws-steps-list">
                    {workPlan.plan.smallestChangePlan.map((step, idx) => (
                      <li key={idx} className="ws-step-item">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>

              {/* Risks & Unknowns */}
              {workPlan.plan.risksAndUnknowns && workPlan.plan.risksAndUnknowns.length > 0 && (
                <section className="ws-section" aria-labelledby="heading-risks">
                  <h2 id="heading-risks" className="ws-section-title">
                    4. Risks & Unknowns to Verify
                  </h2>
                  <div className="ws-card">
                    <ul className="ws-unknowns-list">
                      {workPlan.plan.risksAndUnknowns.map((risk, idx) => (
                        <li key={idx} className="ws-unknown-item">
                          <span className="ws-bullet-icon">⚠</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {/* Manual Verification Actions */}
              {workPlan.plan.manualVerificationPlan &&
                workPlan.plan.manualVerificationPlan.length > 0 && (
                  <section className="ws-section" aria-labelledby="heading-manual-checks">
                    <h2 id="heading-manual-checks" className="ws-section-title">
                      5. Recommended Manual Checks
                    </h2>
                    <div className="ws-card">
                      <ul className="ws-unknowns-list">
                        {workPlan.plan.manualVerificationPlan.map((check, idx) => (
                          <li key={idx} className="ws-unknown-item">
                            <span className="ws-bullet-icon">✓</span>
                            <span>{check}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

              {/* Source Citations */}
              {workPlan.plan.sourceCitations && workPlan.plan.sourceCitations.length > 0 && (
                <section className="ws-section" aria-labelledby="heading-citations">
                  <h2 id="heading-citations" className="ws-section-title">
                    6. Source Citations
                  </h2>
                  <div className="ws-card">
                    <div className="ws-citations-list">
                      {workPlan.plan.sourceCitations.map((c, idx) => (
                        <div key={idx} className="ws-citation-item">
                          <p className="ws-citation-claim">"{c.claim}"</p>
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ws-citation-url"
                          >
                            {c.sourceUrl} ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Next Step Action */}
              <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={() => setCurrentStep('sources')}
                >
                  Proceed to source review →
                </button>
                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={onBackToBrief}
                >
                  Back to context brief
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* STEP 2: SOURCE REVIEW (GATING) */}
      {currentStep === 'sources' && (
        <div className="ws-workbench-step-content" id="step-source-review">
          <div className="ws-gate-header">
            <h2 className="ws-section-title">Human-in-the-Loop Source Verification</h2>
            <p className="ws-paragraph ws-text-muted">
              Web-Slinger generates draft patches exclusively from sources you have directly
              opened and reviewed. Verify each retrieved file before requesting a patch draft.
            </p>
          </div>

          <div className="ws-source-review-list">
            {workPlan?.file_evidence && workPlan.file_evidence.length > 0 ? (
              workPlan.file_evidence.map((file) => (
                <div key={file.path} className="ws-card ws-source-file-review-card">
                  <div className="ws-source-header-row">
                    <label className="ws-checkbox-label">
                      <input
                        type="checkbox"
                        checked={reviewedFilesState[file.path] || false}
                        onChange={(e) =>
                          setReviewedFilesState((prev) => ({
                            ...prev,
                            [file.path]: e.target.checked,
                          }))
                        }
                        className="ws-checkbox"
                      />
                      <span className="ws-source-path-label">{file.path}</span>
                    </label>
                    <a
                      href={file.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-button-secondary"
                      style={{ fontSize: 'var(--ws-font-size-xs)', padding: '4px 10px' }}
                    >
                      Open on GitHub ↗
                    </a>
                  </div>

                  <div className="ws-source-meta-row">
                    <span className="ws-source-meta">REF: {file.ref}</span>
                    <span className="ws-source-meta">SHA: {file.sha.slice(0, 10)}</span>
                    {file.isTruncated && (
                      <span className="ws-source-meta" style={{ color: 'var(--ws-accent-teal)' }}>
                        {file.omittedReason || 'TRUNCATED AT SIZE LIMIT'}
                      </span>
                    )}
                  </div>

                  {file.content && (
                    <details className="ws-source-details">
                      <summary className="ws-source-summary">Preview retrieved content excerpt</summary>
                      <pre className="ws-source-pre">
                        <code>{file.content}</code>
                      </pre>
                    </details>
                  )}
                </div>
              ))
            ) : (
              <p className="ws-paragraph ws-text-muted">
                No file evidence was retrieved for this session. Please return to the work plan.
              </p>
            )}
          </div>

          {/* Mandatory Affirmation Gate (Requirement 4) */}
          <div className="ws-affirmation-box" role="region" aria-label="Human Contributor Affirmation">
            <label className="ws-checkbox-label ws-affirmation-label">
              <input
                type="checkbox"
                checked={hasAffirmed}
                onChange={(e) => setHasAffirmed(e.target.checked)}
                className="ws-checkbox"
                id="checkbox-user-affirmation"
              />
              <span className="ws-affirmation-text">
                “{MANDATORY_USER_AFFIRMATION}”
              </span>
            </label>
          </div>

          {patchError && (
            <div className="ws-error-container" role="alert" style={{ marginTop: 'var(--ws-space-4)' }}>
              <p className="ws-error-title">Unable to generate patch draft</p>
              <p className="ws-error-message">{patchError}</p>
            </div>
          )}

          {/* Action Cluster */}
          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleGeneratePatch}
              disabled={!canGeneratePatch || isPatchLoading}
              aria-label="Generate patch draft"
            >
              {isPatchLoading ? 'Generating patch draft...' : 'Generate patch draft'}
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={() => setCurrentStep('plan')}
            >
              ← Back to work plan
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PATCH REVIEW */}
      {currentStep === 'patch' && (
        <div className="ws-workbench-step-content" id="step-patch-review">
          {/* Persistent Mandatory Exact Notice (Requirement 6) */}
          <div className="ws-workbench-notice ws-patch-persistent-notice" role="note">
            <span className="ws-workbench-notice-icon">⚠</span>
            <p className="ws-workbench-notice-text">
              Draft only. Web-Slinger has not modified a repository or run these changes. Read,
              edit, apply, and test the draft in your own local clone.
            </p>
          </div>

          {patchDraft && (
            <div className="ws-patch-metadata-bar">
              <div className="ws-patch-counts">
                <span className="ws-patch-count-item">
                  <strong>{patchDraft.changed_files.length}</strong> changed file
                  {patchDraft.changed_files.length === 1 ? '' : 's'}
                </span>
                <span className="ws-patch-count-item">
                  <strong>{patchDraft.total_changed_lines}</strong> changed line
                  {patchDraft.total_changed_lines === 1 ? '' : 's'}
                </span>
                {patchDraft.is_user_edited && (
                  <span className="ws-chip ws-badge-confirmed">USER EDITED</span>
                )}
              </div>
              <span className="ws-patch-model">MODEL: {patchDraft.model_id}</span>
            </div>
          )}

          {saveSuccessMessage && (
            <div className="ws-success-banner" role="status">
              ✓ {saveSuccessMessage}
            </div>
          )}

          {copyPatchStatus && (
            <div className="ws-success-banner" role="status">
              ✓ {copyPatchStatus}
            </div>
          )}

          {patchDraft?.warnings && patchDraft.warnings.length > 0 && (
            <div className="ws-warning-banner" role="alert">
              {patchDraft.warnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}

          {/* Editable Unified Diff Editor */}
          <div className="ws-diff-editor-container">
            <div className="ws-diff-header">
              <span className="ws-diff-title">Unified Diff (Editable)</span>
              <span className="ws-diff-hint">You can edit the draft directly below before testing</span>
            </div>
            <textarea
              className="ws-diff-textarea"
              value={editableDiff}
              onChange={(e) => setEditableDiff(e.target.value)}
              rows={16}
              spellCheck={false}
              aria-label="Editable unified diff text"
            />
          </div>

          {/* Action Cluster (Requirement 5 & 7 - Zero Forbidden Buttons) */}
          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleSavePatchDraft}
              disabled={isPatchSaving}
              aria-label="Save my edited draft"
            >
              {isPatchSaving ? 'Saving draft...' : 'Save my edited draft'}
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleCopyPatch}
              aria-label="Copy patch"
            >
              Copy patch
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleDownloadPatch}
              aria-label="Download .patch"
            >
              Download .patch
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleLoadVerificationPlan}
            >
              Proceed to verification prep →
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={() => setCurrentStep('sources')}
            >
              ← Back to source review
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: VERIFICATION PREP */}
      {currentStep === 'verification' && (
        <div className="ws-workbench-step-content" id="step-verification-prep">
          {/* Mandatory Disclaimer (Requirement 8) */}
          <div className="ws-workbench-notice" role="note">
            <span className="ws-workbench-notice-icon">ℹ</span>
            <p className="ws-workbench-notice-text">
              {MANDATORY_VERIFICATION_DISCLAIMER}
            </p>
          </div>

          {isVPlanLoading ? (
            <div className="ws-loading-container" role="status">
              <div className="ws-spinner" />
              <p className="ws-loading-text">
                Synthesizing manual verification checklist...
              </p>
            </div>
          ) : vPlanError ? (
            <div className="ws-error-container" role="alert">
              <p className="ws-error-title">Unable to generate verification checklist</p>
              <p className="ws-error-message">{vPlanError}</p>
            </div>
          ) : verificationPlan?.plan ? (
            <div className="ws-workbench-sections">
              <div className="ws-checklist-container">
                <h2 className="ws-section-title">Manual Verification Checklist</h2>
                <div className="ws-checklist-items">
                  {verificationPlan.plan.checklist.map((item) => (
                    <div key={item.id} className="ws-card ws-checklist-card">
                      <div className="ws-checklist-header">
                        <span className="ws-checklist-item-title">{item.title}</span>
                        {/* Requirement 8: Every item strictly labelled Not verified */}
                        <span className="ws-chip ws-badge-not-verified">
                          NOT VERIFIED
                        </span>
                      </div>
                      <p className="ws-checklist-desc">{item.description}</p>
                      {item.suggestedCommand && (
                        <div className="ws-command-box">
                          <code className="ws-code-command">{item.suggestedCommand}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {copyChecklistStatus && (
                <div className="ws-success-banner" role="status" style={{ marginTop: 'var(--ws-space-4)' }}>
                  ✓ {copyChecklistStatus}
                </div>
              )}

              {/* Action Cluster */}
              <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={handleCopyChecklist}
                  aria-label="Copy checklist"
                >
                  Copy checklist
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={() => setCurrentStep('patch')}
                >
                  ← Back to patch review
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={onReset}
                >
                  New session
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
