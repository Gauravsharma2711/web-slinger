/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  WorkPlanResponse,
  PatchDraftResponse,
  VerificationPlanResponse,
  VerificationRecord,
  VerificationStatus,
  ProofReceiptResponse,
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_RECEIPT_ATTESTATION,
} from '@web-slinger/shared';
import {
  getWorkPlan,
  generateWorkPlan,
  generatePatchDraft,
  updatePatchDraft,
  generateVerificationPlan,
  getVerificationRecords,
  saveVerificationRecords,
  createProofReceipt,
  getProofReceipt,
} from '../api/sessions.js';
import { CodeBlock } from './CodeBlock.js';
import { StageContextPanel } from './StageContextPanel.js';
import { EvidenceTrail } from './EvidenceTrail.js';
import { WhatHappensNext } from './WhatHappensNext.js';

export type WorkbenchStep = 'plan' | 'sources' | 'patch' | 'verification' | 'receipt';

export interface WorkbenchCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  initialStep?: WorkbenchStep;
  onStepChange?: (step: WorkbenchStep) => void;
  onBackToBrief: () => void;
  onContinueToVerify?: () => void;
  onReset: () => void;
}

export const WorkbenchCanvas: React.FC<WorkbenchCanvasProps> = ({
  session,
  issue,
  initialStep = 'plan',
  onStepChange,
  onBackToBrief,
  onContinueToVerify,
  onReset,
}) => {
  const [currentStep, setCurrentStep] = useState<WorkbenchStep>(initialStep);

  useEffect(() => {
    if (onStepChange) {
      onStepChange(currentStep);
    }
  }, [currentStep, onStepChange]);

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

  // Verification Plan & Records state
  const [verificationPlan, setVerificationPlan] = useState<VerificationPlanResponse | null>(null);
  const [verificationRecords, setVerificationRecords] = useState<VerificationRecord[]>([]);
  const [isVerificationLoading, setIsVerificationLoading] = useState<boolean>(false);
  const [isRecordsSaving, setIsRecordsSaving] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [recordsSaveSuccess, setRecordsSaveSuccess] = useState<string | null>(null);
  const [copyChecklistStatus, setCopyChecklistStatus] = useState<string | null>(null);

  // Proof Receipt state
  const [proofReceipt, setProofReceipt] = useState<ProofReceiptResponse | null>(null);
  const [isReceiptLoading, setIsReceiptLoading] = useState<boolean>(false);
  const [isReceiptGenerating, setIsReceiptGenerating] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [hasReceiptAttested, setHasReceiptAttested] = useState<boolean>(false);
  const [branchNameInput, setBranchNameInput] = useState<string>('');
  const [copyReceiptStatus, setCopyReceiptStatus] = useState<string | null>(null);

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

  // Load verification plan and human records
  const loadVerification = useCallback(async () => {
    setIsVerificationLoading(true);
    setVerificationError(null);

    try {
      // 1. Load verification plan
      let plan = verificationPlan;
      if (!plan) {
        plan = await generateVerificationPlan(session.session_id, issue.number);
        setVerificationPlan(plan);
      }

      // 2. Load verification records
      const recordsRes = await getVerificationRecords(session.session_id, issue.number);
      if (recordsRes && recordsRes.records && recordsRes.records.length > 0) {
        setVerificationRecords(recordsRes.records);
      } else if (plan?.plan?.checklist) {
        // Synthesize default records from plan
        const initialRecords: VerificationRecord[] = plan.plan.checklist.map((item) => ({
          checkId: item.id,
          label: item.title,
          command: item.suggestedCommand,
          status: 'not_run',
          userNotes: '',
          recordedAt: new Date().toISOString(),
        }));
        setVerificationRecords(initialRecords);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load verification checks';
      setVerificationError(msg);
    } finally {
      setIsVerificationLoading(false);
    }
  }, [session.session_id, issue.number, verificationPlan]);

  // Load or generate Proof Receipt
  const loadProofReceipt = useCallback(async () => {
    setIsReceiptLoading(true);
    setReceiptError(null);

    try {
      const existing = await getProofReceipt(session.session_id, issue.number);
      if (existing) {
        setProofReceipt(existing);
      }
    } catch {
      // Receipt not yet generated; user can generate on this screen
    } finally {
      setIsReceiptLoading(false);
    }
  }, [session.session_id, issue.number]);

  useEffect(() => {
    if (currentStep === 'verification') {
      loadVerification();
    } else if (currentStep === 'receipt') {
      loadProofReceipt();
    }
  }, [currentStep, loadVerification, loadProofReceipt]);

  const handleLoadVerification = () => {
    if (onContinueToVerify) {
      onContinueToVerify();
    } else {
      setCurrentStep('verification');
    }
  };

  const handleLoadReceiptStep = () => {
    setCurrentStep('receipt');
  };

  // Update a verification check record status
  const handleRecordStatusChange = (checkId: string, status: VerificationStatus) => {
    setVerificationRecords((prev) =>
      prev.map((r) =>
        r.checkId === checkId
          ? {
              ...r,
              status,
              recordedAt: new Date().toISOString(),
            }
          : r
      )
    );
  };

  // Update a verification check note
  const handleRecordNotesChange = (checkId: string, notes: string) => {
    setVerificationRecords((prev) =>
      prev.map((r) =>
        r.checkId === checkId
          ? {
              ...r,
              userNotes: notes,
              recordedAt: new Date().toISOString(),
            }
          : r
      )
    );
  };

  // Update a verification check evidence reference
  const handleRecordEvidenceChange = (checkId: string, evidenceReference: string) => {
    setVerificationRecords((prev) =>
      prev.map((r) =>
        r.checkId === checkId
          ? {
              ...r,
              evidenceReference,
              recordedAt: new Date().toISOString(),
            }
          : r
      )
    );
  };

  // Save verification records to backend
  const handleSaveVerificationRecords = async () => {
    setIsRecordsSaving(true);
    setVerificationError(null);
    setRecordsSaveSuccess(null);

    // Validate that evaluated checks have notes
    for (const rec of verificationRecords) {
      if (rec.status !== 'not_run' && (!rec.userNotes || rec.userNotes.trim().length === 0)) {
        setVerificationError(`Please provide a note for "${rec.label}" before saving.`);
        setIsRecordsSaving(false);
        return;
      }
    }

    try {
      const res = await saveVerificationRecords(
        session.session_id,
        issue.number,
        verificationRecords
      );
      setVerificationRecords(res.records);
      setRecordsSaveSuccess('Verification records saved successfully.');
      setTimeout(() => setRecordsSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save verification records';
      setVerificationError(msg);
    } finally {
      setIsRecordsSaving(false);
    }
  };

  // Copy verification checklist
  const handleCopyChecklist = async () => {
    if (!verificationPlan?.plan?.checklist) return;

    const markdownChecklist = [
      `# Manual Verification Checklist for Issue #${issue.number}`,
      `> Web-Slinger cannot run commands in your local repository. Record only results you personally observed.`,
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

  // Generate Proof Receipt with user attestation
  const handleGenerateProofReceipt = async () => {
    if (!hasReceiptAttested) {
      setReceiptError(
        'You must acknowledge the attestation before generating a Proof Receipt.'
      );
      return;
    }

    setIsReceiptGenerating(true);
    setReceiptError(null);

    try {
      // First ensure verification records are saved
      await saveVerificationRecords(
        session.session_id,
        issue.number,
        verificationRecords
      );

      const res = await createProofReceipt(session.session_id, issue.number, {
        userAttestation: true,
        branchName: branchNameInput.trim() || undefined,
        patchId: patchDraft?.patch_id,
      });

      setProofReceipt(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate Proof Receipt';
      setReceiptError(msg);
    } finally {
      setIsReceiptGenerating(false);
    }
  };

  // Copy receipt as JSON
  const handleCopyReceiptJSON = async () => {
    if (!proofReceipt) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(proofReceipt, null, 2));
      setCopyReceiptStatus('Proof Receipt copied as JSON!');
      setTimeout(() => setCopyReceiptStatus(null), 3000);
    } catch {
      setCopyReceiptStatus('Failed to copy receipt');
      setTimeout(() => setCopyReceiptStatus(null), 3000);
    }
  };

  // Copy receipt as formatted Markdown
  const handleCopyReceiptMarkdown = async () => {
    if (!proofReceipt) return;

    const md = [
      `# Web-Slinger Proof Receipt`,
      `**Status:** \`${proofReceipt.status.toUpperCase()}\``,
      `**Repository:** ${proofReceipt.repository}`,
      `**Issue:** [Issue #${proofReceipt.issue_number}](${proofReceipt.issue_url})`,
      proofReceipt.branch_name ? `**Branch:** \`${proofReceipt.branch_name}\`` : null,
      `**Patch ID:** \`${proofReceipt.patch_id}\``,
      `**Patch SHA-256 Hash:** \`${proofReceipt.patch_hash}\``,
      `**Changed Files (${proofReceipt.changed_files.length}):** ${
        proofReceipt.changed_files.join(', ') || 'None'
      }`,
      `**Total Changed Lines:** ${proofReceipt.total_changed_lines}`,
      `**Created At:** ${proofReceipt.created_at}`,
      '',
      `## User Attestation`,
      `> "${proofReceipt.user_attestation}"`,
      '',
      `## Verification Evidence (${proofReceipt.verification_records.length} checks)`,
      ...proofReceipt.verification_records.map(
        (r) =>
          `- **[${r.status.toUpperCase()}]** ${r.label}\n  *Note:* ${r.userNotes}${
            r.evidenceReference ? `\n  *Evidence:* \`${r.evidenceReference}\`` : ''
          }\n  *Recorded:* ${r.recordedAt}`
      ),
      '',
      `## Reviewed Sources`,
      ...proofReceipt.source_urls.map((url) => `- ${url}`),
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopyReceiptStatus('Proof Receipt copied as Markdown!');
      setTimeout(() => setCopyReceiptStatus(null), 3000);
    } catch {
      setCopyReceiptStatus('Failed to copy receipt');
      setTimeout(() => setCopyReceiptStatus(null), 3000);
    }
  };

  // Download receipt JSON file
  const handleDownloadReceiptJSON = () => {
    if (!proofReceipt) return;
    const blob = new Blob([JSON.stringify(proofReceipt, null, 2)], {
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
  };

  const isFixture =
    workPlan?.is_fixture ||
    patchDraft?.is_fixture ||
    proofReceipt?.is_fixture ||
    issue.is_fixture;

  const notRunCount = verificationRecords.filter((r) => r.status === 'not_run').length;
  const evaluatedCount = verificationRecords.length - notRunCount;

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
        <details className="ws-details-section" style={{ margin: 0, width: 'auto' }}>
          <summary className="ws-details-summary">Details</summary>
          <div className="ws-details-content">
            <div>Session ID: {session.session_id}</div>
            <div>Valid for: 24 hours</div>
            {isFixture && <div>Mode: Sample demonstration fixture</div>}
          </div>
        </details>
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
            onClick={handleLoadVerification}
            aria-current={currentStep === 'verification' ? 'step' : undefined}
          >
            <span className="ws-tab-number">4</span>
            <span className="ws-tab-label">Verification</span>
          </button>
          <button
            type="button"
            className={`ws-tab-button ${currentStep === 'receipt' ? 'ws-tab-active' : ''}`}
            onClick={handleLoadReceiptStep}
            aria-current={currentStep === 'receipt' ? 'step' : undefined}
          >
            <span className="ws-tab-number">5</span>
            <span className="ws-tab-label">Proof Receipt</span>
          </button>
        </div>
      </nav>

      {/* Stage Context Panel */}
      {(currentStep === 'plan' || currentStep === 'sources' || currentStep === 'patch') && (
        <StageContextPanel
          stage="Draft"
          reviewedSourceCount={workPlan?.file_evidence?.length || 0}
        />
      )}
      {currentStep === 'verification' && (
        <StageContextPanel
          stage="Verify"
          recordedCheckCount={verificationRecords.length || verificationPlan?.plan?.checklist?.length || 0}
        />
      )}
      {currentStep === 'receipt' && (
        <StageContextPanel
          stage="Verify"
          recordedCheckCount={proofReceipt?.verification_records?.length || evaluatedCount || 0}
          customExplanation="Proof receipt generated with verified evidence hashes and human attestation."
        />
      )}

      {/* STEP 1: WORK PLAN */}
      {currentStep === 'plan' && (
        <div className="ws-workbench-step-content" id="step-work-plan">
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">What is the smallest safe change for this issue?</h1>
            <p className="ws-prompt-description">
              Review the confirmed problem and candidate files before writing code.
            </p>
          </div>

          {/* Issue summary badge */}
          <div className="ws-issue-card" style={{ marginBottom: 'var(--ws-space-6)' }}>
            <div className="ws-issue-card-header">
              <span className="ws-issue-number">#{issue.number}</span>
              <span className="ws-issue-repo">{session.research_results?.[0]?.company_name ? `${session.research_results[0].company_name} • ` : ''}Practice Issue</span>
            </div>
            <h2 className="ws-issue-card-title">{issue.title}</h2>
          </div>

          {isPlanLoading ? (
            <div className="ws-loading-container" role="status">
              <div className="ws-spinner" />
              <p className="ws-loading-text">
                Synthesizing evidence-grounded contribution work plan...
              </p>
            </div>
          ) : planError ? (
            <div className="ws-error-card" role="alert">
              <div className="ws-error-title">Unable to load contribution work plan</div>
              <p className="ws-error-body">
                <strong>What happened:</strong> {planError}
              </p>
              <p className="ws-error-body">
                <strong>What is saved:</strong> Your context brief and session are saved.
              </p>
              <p className="ws-error-body">
                <strong>Next action:</strong> Click Retry generation to synthesize the work plan again.
              </p>
              <div className="ws-actions" style={{ marginTop: 'var(--ws-space-4)' }}>
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={() => loadOrGenerateWorkPlan(true)}
                >
                  Retry generation
                </button>
              </div>
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

              {/* Candidate Files */}
              <section className="ws-section" aria-labelledby="heading-candidate-files">
                <h2 id="heading-candidate-files" className="ws-section-title">
                  2. Candidate Target Files ({workPlan.plan.candidateFiles.length})
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
                          {file.confidence === 'confirmed' ? 'Strong first option' : 'Needs more reading'}
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

              {/* Manual Checks to Run */}
              {workPlan.plan.manualVerificationPlan && workPlan.plan.manualVerificationPlan.length > 0 && (
                <section className="ws-section" aria-labelledby="heading-manual-checks">
                  <h2 id="heading-manual-checks" className="ws-section-title">
                    5. Recommended Manual Checks
                  </h2>
                  <div className="ws-card">
                    <ul className="ws-checks-list">
                      {workPlan.plan.manualVerificationPlan.map((check: string, idx: number) => (
                        <li key={idx} className="ws-check-item">
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
                    6. Source Evidence Grounding
                  </h2>
                  <div className="ws-card">
                    <div className="ws-citations-list">
                      {workPlan.plan.sourceCitations.map((citation, idx) => (
                        <div key={idx} className="ws-citation-item">
                          <span className="ws-citation-claim">"{citation.claim}"</span>
                          <a
                            href={citation.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ws-source-link"
                          >
                            Verified Source ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Action Cluster */}
              <div className="ws-actions">
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={() => setCurrentStep('sources')}
                >
                  Review source files
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
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">Have you verified the source files before drafting?</h1>
            <p className="ws-prompt-description">
              Read the linked repository files on GitHub and confirm your review below.
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

                  <details className="ws-details-section">
                    <summary className="ws-details-summary">Details</summary>
                    <div className="ws-details-content">
                      <div>Ref: {file.ref}</div>
                      <div>SHA: {file.sha}</div>
                      {file.isTruncated && (
                        <div>{file.omittedReason || 'Truncated at size limit'}</div>
                      )}
                    </div>
                  </details>

                  <CodeBlock
                    code={
                      file.content
                        ? file.content.slice(0, 400) + (file.content.length > 400 ? '\n...' : '')
                        : '// Content unavailable'
                    }
                    language={
                      file.path.endsWith('.md')
                        ? 'Markdown'
                        : file.path.endsWith('.ts')
                        ? 'TypeScript'
                        : file.path.endsWith('.js')
                        ? 'JavaScript'
                        : file.path.endsWith('.json')
                        ? 'JSON'
                        : 'TypeScript'
                    }
                    explanation="Source file excerpt retrieved from the upstream repository."
                  />
                </div>
              ))
            ) : (
              <div className="ws-card">
                <p className="ws-paragraph ws-text-muted">
                  No source files were retrieved for this issue.
                </p>
              </div>
            )}
          </div>

          {/* Explicit User Affirmation Gate */}
          <div className="ws-card ws-affirmation-card">
            <label className="ws-checkbox-label">
              <input
                type="checkbox"
                checked={hasAffirmed}
                onChange={(e) => setHasAffirmed(e.target.checked)}
                className="ws-checkbox"
              />
              <span className="ws-affirmation-text">
                {MANDATORY_USER_AFFIRMATION}
              </span>
            </label>
          </div>

          {patchError && (
            <div className="ws-error-card" role="alert">
              <div className="ws-error-title">Patch generation notice</div>
              <p className="ws-error-body">
                <strong>What happened:</strong> {patchError}
              </p>
              <p className="ws-error-body">
                <strong>What is saved:</strong> Your reviewed sources and work plan are preserved.
              </p>
              <p className="ws-error-body">
                <strong>Next action:</strong> Check your source selection and click Generate patch draft again.
              </p>
            </div>
          )}

          {/* Action Cluster */}
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleGeneratePatch}
              disabled={!canGeneratePatch || isPatchLoading}
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

      {/* STEP 3: PATCH REVIEW & EDIT */}
      {currentStep === 'patch' && (
        <div className="ws-workbench-step-content" id="step-patch-review">
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">Does this draft match your verified changes?</h1>
            <p className="ws-prompt-description">
              Edit the suggested diff directly. When ready, test these changes in your local clone.
            </p>
          </div>

          {/* Mandatory Persistent Notice */}
          <div className="ws-workbench-notice" role="note">
            <span className="ws-workbench-notice-icon">⚠</span>
            <p className="ws-workbench-notice-text">
              Draft only. Web-Slinger has not modified a repository or run these changes.
              Read, edit, apply, and test the draft in your own local clone.
            </p>
          </div>

          {patchDraft && (
            <div className="ws-patch-meta-bar">
              <span className="ws-patch-meta-item">
                <strong>{patchDraft.changed_files.length}</strong>{' '}
                {patchDraft.changed_files.length === 1 ? 'changed file' : 'changed files'}
              </span>
              <span className="ws-patch-meta-item">
                <strong>{patchDraft.total_changed_lines}</strong> changed lines
              </span>
              <span
                className={`ws-chip ${
                  patchDraft.status === 'completed' ? 'ws-badge-confirmed' : 'ws-badge-candidate'
                }`}
              >
                {patchDraft.status === 'completed' ? 'SYNTACTICALLY VALID' : 'NEEDS REVIEW'}
              </span>
            </div>
          )}

          {/* Warnings list if any */}
          {patchDraft?.warnings && patchDraft.warnings.length > 0 && (
            <div className="ws-card ws-warnings-card">
              <h3 className="ws-section-title" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                Patch Warnings
              </h3>
              <ul className="ws-unknowns-list">
                {patchDraft.warnings.map((w, idx) => (
                  <li key={idx} className="ws-unknown-item">
                    <span>⚠ {w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Diff Editor */}
          <div className="ws-diff-editor-container">
            <div className="ws-diff-editor-header">
              <span className="ws-diff-editor-title">Unified Diff Editor</span>
              <span className="ws-diff-editor-hint">
                Editable text only. Edits are saved to your session record.
              </span>
            </div>
            <textarea
              className="ws-diff-textarea"
              value={editableDiff}
              onChange={(e) => setEditableDiff(e.target.value)}
              rows={12}
              aria-label="Editable unified diff"
              spellCheck={false}
            />
          </div>

          {/* Status Feedback */}
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

          {patchError && (
            <div className="ws-error-card" role="alert">
              <div className="ws-error-title">Patch saving notice</div>
              <p className="ws-error-body">
                <strong>What happened:</strong> {patchError}
              </p>
              <p className="ws-error-body">
                <strong>What is saved:</strong> Your previous draft edits are preserved.
              </p>
              <p className="ws-error-body">
                <strong>Next action:</strong> Click Save my edited draft to try again.
              </p>
            </div>
          )}

          {/* Action Cluster (STRICTLY NO Apply, Fix, Push, Commit, Submit, PR buttons) */}
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleSavePatchDraft}
              disabled={isPatchSaving}
            >
              {isPatchSaving ? 'Saving edits...' : 'Save my edited draft'}
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleCopyPatch}
            >
              Copy patch
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleDownloadPatch}
            >
              Download .patch
            </button>

            <button
              type="button"
              className="ws-button-primary"
              onClick={handleLoadVerification}
            >
              Continue to verification
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

      {/* STEP 4: VERIFICATION EVIDENCE (HUMAN-REPORTED) */}
      {currentStep === 'verification' && (
        <div className="ws-workbench-step-content" id="step-verification">
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">What test results did you personally observe?</h1>
            <p className="ws-prompt-description">
              Record the results of your manual commands. Web-Slinger does not run code on your machine.
            </p>
          </div>

          {/* Prominent Mandatory Notice */}
          <div className="ws-workbench-notice" role="note">
            <span className="ws-workbench-notice-icon">ℹ</span>
            <p className="ws-workbench-notice-text">
              Web-Slinger cannot run commands in your local repository. Record only results you
              personally observed.
            </p>
          </div>

          {isVerificationLoading ? (
            <div className="ws-loading-container" role="status">
              <div className="ws-spinner" />
              <p className="ws-loading-text">
                Loading verification checklist and session records...
              </p>
            </div>
          ) : (
            <div className="ws-workbench-sections">
              <div className="ws-checklist-container">
                <div className="ws-checklist-top-bar">
                  <h2 className="ws-section-title">Record Verification Results</h2>
                  <div className="ws-verification-summary-chips">
                    <span className="ws-chip">
                      Evaluated: {evaluatedCount} / {verificationRecords.length}
                    </span>
                    {notRunCount > 0 && (
                      <span className="ws-chip ws-badge-not-run">
                        {notRunCount} Not Run
                      </span>
                    )}
                  </div>
                </div>

                <div className="ws-verification-records-list">
                  {verificationRecords.map((record) => (
                    <div key={record.checkId} className="ws-card ws-verification-record-card">
                      <div className="ws-verification-card-header">
                        <span className="ws-checklist-item-title">{record.label}</span>
                        <span className={`ws-chip ws-badge-${record.status.replace('_', '-')}`}>
                          {record.status.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>

                      {record.command && (
                        <CodeBlock
                          code={record.command}
                          language="PowerShell"
                          explanation="Execute this command in your local repository terminal."
                        />
                      )}

                      {/* Status Selector */}
                      <div className="ws-verification-field-group">
                        <label className="ws-field-label">Verification Status</label>
                        <div className="ws-status-selector" role="radiogroup" aria-label={`Status for ${record.label}`}>
                          {(['passed', 'failed', 'blocked', 'not_run'] as VerificationStatus[]).map(
                            (st) => (
                              <button
                                key={st}
                                type="button"
                                className={`ws-status-btn ws-status-btn-${st.replace('_', '-')} ${
                                  record.status === st ? 'ws-status-btn-selected' : ''
                                }`}
                                onClick={() => handleRecordStatusChange(record.checkId, st)}
                                aria-pressed={record.status === st}
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

                      {/* User Notes (Required if evaluated) */}
                      <div className="ws-verification-field-group">
                        <label className="ws-field-label" htmlFor={`notes-${record.checkId}`}>
                          Your Verification Notes {record.status !== 'not_run' && <span className="ws-required-star">*</span>}
                        </label>
                        <textarea
                          id={`notes-${record.checkId}`}
                          className="ws-notes-textarea"
                          value={record.userNotes}
                          onChange={(e) =>
                            handleRecordNotesChange(record.checkId, e.target.value)
                          }
                          placeholder={
                            record.status === 'not_run'
                              ? 'Not executed yet.'
                              : 'Describe your observation (e.g. 42 tests passed locally in branch fix/node-fs).'
                          }
                          rows={2}
                        />
                      </div>

                      {/* Evidence Reference (Optional) */}
                      <div className="ws-verification-field-group">
                        <label className="ws-field-label" htmlFor={`evidence-${record.checkId}`}>
                          Evidence Reference (Optional)
                        </label>
                        <input
                          id={`evidence-${record.checkId}`}
                          type="text"
                          className="ws-input-text"
                          value={record.evidenceReference || ''}
                          onChange={(e) =>
                            handleRecordEvidenceChange(record.checkId, e.target.value)
                          }
                          placeholder="e.g. Terminal output summary, local log path, or screenshot name"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Feedback */}
              {recordsSaveSuccess && (
                <div className="ws-success-banner" role="status" style={{ marginTop: 'var(--ws-space-4)' }}>
                  ✓ {recordsSaveSuccess}
                </div>
              )}

              {copyChecklistStatus && (
                <div className="ws-success-banner" role="status" style={{ marginTop: 'var(--ws-space-4)' }}>
                  ✓ {copyChecklistStatus}
                </div>
              )}

              {verificationError && (
                <div className="ws-error-card" role="alert" style={{ marginTop: 'var(--ws-space-4)' }}>
                  <div className="ws-error-title">Verification notes notice</div>
                  <p className="ws-error-body">
                    <strong>What happened:</strong> {verificationError}
                  </p>
                  <p className="ws-error-body">
                    <strong>What is saved:</strong> Your draft patch and evaluated checks are preserved.
                  </p>
                  <p className="ws-error-body">
                    <strong>Next action:</strong> Provide the required notes and click Save verification records.
                  </p>
                </div>
              )}

              {/* Action Cluster */}
              <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={handleLoadReceiptStep}
                >
                  Create proof receipt
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={handleSaveVerificationRecords}
                  disabled={isRecordsSaving}
                >
                  {isRecordsSaving ? 'Saving records...' : 'Save verification records'}
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={handleCopyChecklist}
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: PROOF RECEIPT */}
      {currentStep === 'receipt' && (
        <div className="ws-workbench-step-content" id="step-proof-receipt">
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">Is your verified proof ready to export?</h1>
            <p className="ws-prompt-description">
              Review your verified checks and attestation. Copy or download your receipt below.
            </p>
          </div>

          {isReceiptLoading ? (
            <div className="ws-loading-container" role="status">
              <div className="ws-spinner" />
              <p className="ws-loading-text">Loading Proof Receipt...</p>
            </div>
          ) : proofReceipt ? (
            /* RENDER COMPLETED / PERSISTED PROOF RECEIPT */
            <div className="ws-workbench-sections">
              {/* Status Header Banner */}
              <div
                className={`ws-receipt-status-banner ${
                  proofReceipt.status === 'complete'
                    ? 'ws-receipt-banner-complete'
                    : 'ws-receipt-banner-incomplete'
                }`}
              >
                <div className="ws-receipt-banner-left">
                  <span
                    className={`ws-chip ${
                      proofReceipt.status === 'complete'
                        ? 'ws-badge-confirmed'
                        : 'ws-badge-not-run'
                    }`}
                    style={{ fontSize: 'var(--ws-font-size-sm)', fontWeight: 700 }}
                  >
                    RECEIPT STATUS: {proofReceipt.status.toUpperCase()}
                  </span>
                  <details className="ws-details-section" style={{ margin: 0, width: 'auto' }}>
                    <summary className="ws-details-summary">Details</summary>
                    <div className="ws-details-content">
                      <div>Receipt ID: {proofReceipt.receipt_id}</div>
                    </div>
                  </details>
                </div>
                {proofReceipt.status === 'incomplete' && (
                  <p className="ws-receipt-warning-text">
                    Some required checks were not evaluated or remained as Not Run.
                  </p>
                )}
              </div>

              {/* Receipt Metadata Grid */}
              <div className="ws-card ws-receipt-meta-card">
                <div className="ws-receipt-grid">
                  <div className="ws-receipt-grid-item">
                    <span className="ws-receipt-label">Upstream Repository</span>
                    <span className="ws-receipt-value">{proofReceipt.repository}</span>
                  </div>

                  <div className="ws-receipt-grid-item">
                    <span className="ws-receipt-label">Issue Reference</span>
                    <a
                      href={proofReceipt.issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-source-link"
                    >
                      Issue #{proofReceipt.issue_number} ↗
                    </a>
                  </div>

                  {proofReceipt.branch_name && (
                    <div className="ws-receipt-grid-item">
                      <span className="ws-receipt-label">Local Branch</span>
                      <span className="ws-receipt-value">
                        <code>{proofReceipt.branch_name}</code>
                      </span>
                    </div>
                  )}

                  <div className="ws-receipt-grid-item">
                    <span className="ws-receipt-label">Changed Files</span>
                    <span className="ws-receipt-value">
                      {proofReceipt.changed_files.length > 0
                        ? proofReceipt.changed_files.join(', ')
                        : 'None (draft only)'}
                    </span>
                  </div>

                  <div className="ws-receipt-grid-item">
                    <span className="ws-receipt-label">Total Changed Lines</span>
                    <span className="ws-receipt-value">{proofReceipt.total_changed_lines}</span>
                  </div>

                  <div className="ws-receipt-grid-item">
                    <span className="ws-receipt-label">Generated Timestamp</span>
                    <span className="ws-receipt-value">{proofReceipt.created_at}</span>
                  </div>
                </div>

                <details className="ws-details-section">
                  <summary className="ws-details-summary">Technical Details</summary>
                  <div className="ws-details-content">
                    <CodeBlock
                      code={`{\n  "patch_id": "${proofReceipt.patch_id}",\n  "patch_hash": "${proofReceipt.patch_hash}"\n}`}
                      language="JSON"
                      explanation="Cryptographic patch digest and identifier for audit verification."
                    />
                  </div>
                </details>
              </div>

              {/* Mandatory User Attestation Quote */}
              <div className="ws-card ws-attestation-display-card">
                <span className="ws-receipt-label">Human Attestation Declaration</span>
                <blockquote className="ws-attestation-quote">
                  "{proofReceipt.user_attestation}"
                </blockquote>
              </div>

              {/* Verification Records Table (FAILED & BLOCKED CHECKS REMAIN VISIBLE) */}
              <div className="ws-card ws-receipt-records-card">
                <h3 className="ws-section-title" style={{ fontSize: 'var(--ws-font-size-base)' }}>
                  Human-Recorded Verification Checks ({proofReceipt.verification_records.length})
                </h3>
                <div className="ws-receipt-records-list">
                  {proofReceipt.verification_records.map((rec) => (
                    <div key={rec.checkId} className="ws-receipt-record-item">
                      <div className="ws-receipt-record-header">
                        <span className="ws-receipt-record-title">{rec.label}</span>
                        <span className={`ws-chip ws-badge-${rec.status.replace('_', '-')}`}>
                          {rec.status.toUpperCase().replace('_', ' ')}
                        </span>
                      </div>

                      <p className="ws-receipt-record-notes">
                        <strong>Notes:</strong> {rec.userNotes || 'No notes entered.'}
                      </p>

                      {rec.evidenceReference && (
                        <CodeBlock
                          code={rec.evidenceReference}
                          language="Log"
                          explanation="Evidence observation summary entered during verification."
                        />
                      )}

                      <span className="ws-receipt-record-timestamp">
                        Recorded at: {rec.recordedAt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviewed Sources */}
              <div className="ws-card ws-receipt-sources-card">
                <h3 className="ws-section-title" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                  Reviewed Source Evidence Links
                </h3>
                <ul className="ws-sources-list">
                  {proofReceipt.source_urls.map((url) => (
                    <li key={url} className="ws-source-item">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ws-source-link"
                      >
                        {url} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Feedback messages */}
              {copyReceiptStatus && (
                <div className="ws-success-banner" role="status">
                  ✓ {copyReceiptStatus}
                </div>
              )}

              {/* Actions (Strictly Copy & Download only; ZERO Push, Commit, Submit, PR buttons) */}
              <div className="ws-actions">
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={handleCopyReceiptJSON}
                >
                  Copy receipt (JSON)
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={handleCopyReceiptMarkdown}
                >
                  Copy receipt (Markdown)
                </button>

                <EvidenceTrail
                  items={[
                    {
                      type: 'issue',
                      label: `Issue #${proofReceipt.issue_number}`,
                      detail: proofReceipt.repository,
                      url: proofReceipt.issue_url,
                    },
                    ...proofReceipt.source_urls.map((url, idx) => ({
                      type: 'guide' as const,
                      label: `Source Reference ${idx + 1}`,
                      url,
                    })),
                    ...proofReceipt.verification_records.map((v) => ({
                      type: 'check' as const,
                      label: v.label,
                      detail: `Status: ${v.status.toUpperCase()} • ${v.userNotes || 'Recorded'}`,
                    })),
                  ]}
                  title="Proof Receipt Evidence Trail"
                />

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={handleDownloadReceiptJSON}
                >
                  Download receipt (.json)
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={() => setCurrentStep('verification')}
                >
                  ← Back to verification
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
          ) : (
            /* PROMPT USER TO ATTEST AND GENERATE PROOF RECEIPT */
            <div className="ws-workbench-sections">
              <div className="ws-gate-header">
                <h2 className="ws-section-title">Generate Truthful Proof Receipt</h2>
                <p className="ws-paragraph ws-text-muted">
                  A Proof Receipt compiles your human-verified observations, reviewed source links,
                  and patch hash into a permanent verifiable record.
                </p>
              </div>

              {/* Status Preflight Summary */}
              <div className="ws-card">
                <h3 className="ws-section-title" style={{ fontSize: 'var(--ws-font-size-base)' }}>
                  Verification Status Preflight
                </h3>
                <div className="ws-preflight-row">
                  <span>Evaluated checks:</span>
                  <strong>{evaluatedCount} of {verificationRecords.length}</strong>
                </div>
                {notRunCount > 0 ? (
                  <div className="ws-warning-banner" role="note" style={{ marginTop: 'var(--ws-space-3)' }}>
                    ⚠ <strong>{notRunCount} checks</strong> remain marked as <code>NOT RUN</code>.
                    Generating now will produce an <strong>INCOMPLETE</strong> Proof Receipt.
                  </div>
                ) : (
                  <div className="ws-success-banner" role="status" style={{ marginTop: 'var(--ws-space-3)' }}>
                    ✓ All checks have been evaluated. Generating now will produce a <strong>COMPLETE</strong> Proof Receipt.
                  </div>
                )}
              </div>

              {/* Branch Name Input */}
              <div className="ws-card">
                <label className="ws-field-label" htmlFor="branch-name-input">
                  Local Workspace Branch Name (Optional)
                </label>
                <input
                  id="branch-name-input"
                  type="text"
                  className="ws-input-text"
                  value={branchNameInput}
                  onChange={(e) => setBranchNameInput(e.target.value)}
                  placeholder="e.g. fix/node-fs-lesson-accuracy"
                />
              </div>

              {/* Mandatory User Attestation Checkbox (Requirement 5) */}
              <div className="ws-card ws-affirmation-card">
                <label className="ws-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasReceiptAttested}
                    onChange={(e) => setHasReceiptAttested(e.target.checked)}
                    className="ws-checkbox"
                  />
                  <span className="ws-affirmation-text">
                    {MANDATORY_RECEIPT_ATTESTATION}
                  </span>
                </label>
              </div>

              {receiptError && (
                <div className="ws-error-card" role="alert">
                  <div className="ws-error-title">Proof receipt notice</div>
                  <p className="ws-error-body">
                    <strong>What happened:</strong> {receiptError}
                  </p>
                  <p className="ws-error-body">
                    <strong>What is saved:</strong> All your verified check records and attestation are saved.
                  </p>
                  <p className="ws-error-body">
                    <strong>Next action:</strong> Complete the attestation and click Generate Proof Receipt.
                  </p>
                </div>
              )}

              {/* Action Cluster */}
              <div className="ws-actions">
                <button
                  type="button"
                  className="ws-button-primary"
                  onClick={handleGenerateProofReceipt}
                  disabled={!hasReceiptAttested || isReceiptGenerating}
                >
                  {isReceiptGenerating ? 'Generating Proof Receipt...' : 'Generate Proof Receipt'}
                </button>

                <button
                  type="button"
                  className="ws-button-secondary"
                  onClick={() => setCurrentStep('verification')}
                >
                  ← Back to verification
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* What Happens Next Card */}
      <WhatHappensNext
        stepName={
          currentStep === 'plan'
            ? 'Step 2: Source Review'
            : currentStep === 'sources'
            ? 'Step 3: Patch Review'
            : currentStep === 'patch'
            ? 'Step 4: Verification'
            : currentStep === 'verification'
            ? 'Step 5: Proof Receipt'
            : 'Pull Request & Verification Evidence'
        }
        description={
          currentStep === 'plan'
            ? 'Next: Inspect the retrieved repository source files and confirm your review.'
            : currentStep === 'sources'
            ? 'Next: Generate and inspect the editable unified diff patch draft.'
            : currentStep === 'patch'
            ? 'Next: Perform the manual verification checks in your local repository.'
            : currentStep === 'verification'
            ? 'Next: Attest your observed results and generate a verifiable proof receipt.'
            : 'Next: Copy the proof receipt and patch into your local git workspace.'
        }
      />
    </div>
  );
};
