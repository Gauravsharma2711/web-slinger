/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  ContextBriefResponse,
} from '@web-slinger/shared';
import {
  getContextBrief,
  generateContextBrief,
  ContextBriefApiError,
} from '../api/sessions.js';
import { StageContextPanel } from './StageContextPanel.js';
import { EvidenceTrail, EvidenceItem } from './EvidenceTrail.js';
import { WhatHappensNext } from './WhatHappensNext.js';

export interface ContextBriefCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  onBackToIssues: () => void;
  onOpenWorkbench?: () => void;
  onReset: () => void;
}

export const ContextBriefCanvas: React.FC<ContextBriefCanvasProps> = ({
  session,
  issue,
  onBackToIssues,
  onOpenWorkbench,
  onReset,
}) => {
  const [briefResponse, setBriefResponse] = useState<ContextBriefResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workbenchMessage, setWorkbenchMessage] = useState<string | null>(null);

  const hasRequestedRef = useRef<boolean>(false);

  const loadOrGenerateBrief = useCallback(
    async (forceGenerate = false) => {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      try {
        if (!forceGenerate) {
          try {
            // First check if brief has already been persisted for this issue
            const existing = await getContextBrief(session.session_id, issue.number);
            if (existing && existing.status) {
              setBriefResponse(existing);
              setIsLoading(false);
              return;
            }
          } catch {
            // Not found yet; proceed to generate
          }
        }

        // Generate exactly once
        const generated = await generateContextBrief(session.session_id, issue.number);
        setBriefResponse(generated);
      } catch (err: unknown) {
        const briefErr = err as ContextBriefApiError;
        setErrorStatus(briefErr.status || 500);
        setErrorMessage(briefErr.message || 'Unable to generate evidence-grounded context brief.');
        if (briefErr.data) {
          setBriefResponse(briefErr.data);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [session.session_id, issue.number]
  );

  useEffect(() => {
    if (!hasRequestedRef.current) {
      hasRequestedRef.current = true;
      loadOrGenerateBrief(false);
    }
  }, [loadOrGenerateBrief]);

  const handleOpenWorkbench = () => {
    if (onOpenWorkbench) {
      onOpenWorkbench();
    } else {
      setWorkbenchMessage(
        'Brief verified. The Staged Workbench (Context → Proposal → Verification) unlocks in Day 4.'
      );
    }
  };

  const isVertexError =
    errorStatus === 500 ||
    errorStatus === 502 ||
    briefResponse?.status === 'failed' ||
    (errorMessage && errorMessage.toLowerCase().includes('vertex'));

  const isSourceUnavailable =
    errorStatus === 404 ||
    (errorMessage &&
      (errorMessage.toLowerCase().includes('not found') ||
        errorMessage.toLowerCase().includes('unavailable')));

  const isNeedsReview =
    briefResponse?.status === 'needs_review' ||
    (briefResponse?.validation_errors && briefResponse.validation_errors.length > 0);

  const brief = briefResponse?.brief;
  const isFixture = briefResponse?.is_fixture || issue.is_fixture;

  // Build real evidence items from brief citations & issue
  const evidenceItems: EvidenceItem[] = [
    {
      type: 'issue',
      label: `#${issue.number} • ${issue.title}`,
      detail: issue.repository_relationship_label || 'Issue report',
      url: issue.html_url,
    },
    ...(brief?.sourceCitations || []).map((c, idx) => ({
      type: 'guide' as const,
      label: `Citation S${idx + 1}`,
      detail: c.claim,
      url: c.sourceUrl,
    })),
  ];

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <button
            type="button"
            className="ws-back-button"
            onClick={onBackToIssues}
            aria-label="Back to candidate issues"
          >
            ← Back to candidate issues
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
          </div>
        </details>
      </div>

      {/* 1. LOADING STATE */}
      {isLoading && (
        <div role="status" aria-live="polite">
          <h1 className="ws-prompt-heading">Generating evidence-grounded brief...</h1>
          <div className="ws-status-block">
            <div className="ws-status-indicator" />
            <p className="ws-status-sentence">
              Analyzing issue #{issue.number}, repository guidelines, and source constraints...
            </p>
          </div>
        </div>
      )}

      {/* 2. VERTEX AI / MODEL GENERATION ERROR */}
      {!isLoading && isVertexError && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Brief generation paused.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">AI model unavailable</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || 'The AI service encountered an issue generating the brief.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your candidate issue selection and research session are preserved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Click Retry to attempt generating the brief again, or view the issue on GitHub.
            </p>
          </div>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => loadOrGenerateBrief(true)}
            >
              Retry
            </button>
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ws-button-secondary"
            >
              View on GitHub ↗
            </a>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToIssues}
            >
              Back to candidate issues
            </button>
          </div>
        </div>
      )}

      {/* 3. SOURCE RETRIEVAL ERROR (404) */}
      {!isLoading && !isVertexError && isSourceUnavailable && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Issue sources unavailable.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">Source not found</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || `Issue #${issue.number} could not be retrieved from GitHub.`}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your session and chosen stack are saved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Return to candidate issues to select another option.
            </p>
          </div>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onBackToIssues}
            >
              Back to candidate issues
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
      )}

      {/* 4. VALIDATION ERROR / NEEDS REVIEW STATE */}
      {!isLoading && !isVertexError && !isSourceUnavailable && isNeedsReview && !brief && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Brief needs manual review.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">Validation review required</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || 'The generated brief did not pass all ground truth verification checks.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your candidate issue selection is saved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Click Regenerate brief to produce a validated brief.
            </p>
          </div>

          {briefResponse?.validation_errors && briefResponse.validation_errors.length > 0 && (
            <details className="ws-details-section" style={{ marginBottom: 'var(--ws-space-6)' }}>
              <summary className="ws-details-summary">Details</summary>
              <div className="ws-details-content">
                <ul className="ws-reasons-list">
                  {briefResponse.validation_errors.map((err, idx) => (
                    <li key={idx} className="ws-reason-item">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => loadOrGenerateBrief(true)}
            >
              Regenerate brief
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToIssues}
            >
              Back to candidate issues
            </button>
          </div>
        </div>
      )}

      {/* 5. SUCCESSFUL / VALID CONTEXT BRIEF DISPLAY */}
      {!isLoading && !isVertexError && !isSourceUnavailable && brief && (
        <div className="ws-brief-container">
          {/* Dominant Question Heading */}
          <h1 className="ws-prompt-heading">
            What is this issue about and what should you verify?
          </h1>

          <StageContextPanel
            stage="Understand"
            relationshipLabel={issue.repository_relationship_label || 'Selected practice repository'}
            sourceCount={brief.sourceCitations?.length || briefResponse?.sources?.length || 1}
            customExplanation="Decide whether this issue scope and cited guidance match your goals before opening the workbench."
          />

          {/* Workbench Message if triggered */}
          {workbenchMessage && (
            <div className="ws-notice-banner" role="status" aria-live="polite">
              <span className="ws-notice-dot" />
              <span>{workbenchMessage}</span>
            </div>
          )}

          {/* Issue Header Info Box */}
          <div className="ws-issue-card" style={{ marginBottom: 'var(--ws-space-6)' }}>
            <div className="ws-issue-card-header">
              <div className="ws-issue-card-header-left">
                <span className="ws-issue-number">#{issue.number}</span>
                <span className="ws-issue-repo">{session.research_results?.[0]?.company_name ? `${session.research_results[0].company_name} • ` : ''}Practice Issue</span>
              </div>
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ws-source-link"
                aria-label={`View issue #${issue.number} on GitHub (opens in new window)`}
              >
                View on GitHub ↗
              </a>
            </div>
            <h2 className="ws-issue-card-title">{issue.title}</h2>
          </div>

          {/* Details toggle for technical metadata */}
          <details className="ws-details-section">
            <summary className="ws-details-summary">Details</summary>
            <div className="ws-details-content">
              <div>Model: {briefResponse?.model_id || 'Gemini'}</div>
              <div>Sources cited: {briefResponse?.sources.length ?? 1}</div>
              {isFixture && <div>Mode: Sample demonstration fixture</div>}
            </div>
          </details>

          {/* Item 4: Summary */}
          <section className="ws-brief-section" aria-labelledby="brief-summary-heading">
            <h2 id="brief-summary-heading" className="ws-brief-section-title">
              Summary
            </h2>
            <div className="ws-brief-card">
              <p className="ws-brief-text">{brief.summary}</p>
            </div>
          </section>

          {/* Item 5: Likely Contribution Shape */}
          <section className="ws-brief-section" aria-labelledby="brief-shape-heading">
            <h2 id="brief-shape-heading" className="ws-brief-section-title">
              Likely Contribution Shape
            </h2>
            <div className="ws-brief-card">
              <p className="ws-brief-text">{brief.likelyContributionShape}</p>
            </div>
          </section>

          {/* Item 6: What to Read First */}
          {brief.whatToReadFirst && brief.whatToReadFirst.length > 0 && (
            <section className="ws-brief-section" aria-labelledby="brief-read-first-heading">
              <h2 id="brief-read-first-heading" className="ws-brief-section-title">
                What to Read First
              </h2>
              <div className="ws-brief-card">
                <ul className="ws-read-first-list">
                  {brief.whatToReadFirst.map((item, idx) => (
                    <li key={idx} className="ws-read-first-item">
                      <span className="ws-read-first-instruction">{item.instruction}</span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ws-source-link"
                        aria-label={`Read source for: ${item.instruction} (opens in new window)`}
                      >
                        Read source ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Item 7: Unknowns You Must Verify */}
          {brief.unknownsToVerify && brief.unknownsToVerify.length > 0 && (
            <section className="ws-brief-section" aria-labelledby="brief-unknowns-heading">
              <h2 id="brief-unknowns-heading" className="ws-brief-section-title">
                Unknowns You Must Verify
              </h2>
              <div className="ws-brief-card">
                <ul className="ws-reasons-list">
                  {brief.unknownsToVerify.map((unknown, idx) => (
                    <li key={idx} className="ws-reason-item">
                      {unknown}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Item 8: Suggested First Question */}
          {brief.suggestedFirstQuestion && (
            <section className="ws-brief-section" aria-labelledby="brief-question-heading">
              <h2 id="brief-question-heading" className="ws-brief-section-title">
                Suggested First Question
              </h2>
              <div className="ws-brief-card">
                <p className="ws-brief-text">{brief.suggestedFirstQuestion}</p>
              </div>
            </section>
          )}

          {/* Item 9: Source Citations */}
          {brief.sourceCitations && brief.sourceCitations.length > 0 && (
            <section className="ws-brief-section" aria-labelledby="brief-citations-heading">
              <h2 id="brief-citations-heading" className="ws-brief-section-title">
                Source Citations
              </h2>
              <div className="ws-brief-card">
                <div className="ws-citations-list">
                  {brief.sourceCitations.map((citation, idx) => (
                    <div key={idx} className="ws-citation-item">
                      <div className="ws-citation-claim">
                        <span className="ws-citation-tag">[S{idx + 1}]</span>
                        <span>{citation.claim}</span>
                      </div>
                      <a
                        href={citation.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ws-source-link"
                        aria-label={`View citation source S${idx + 1} on GitHub (opens in new window)`}
                      >
                        Source S{idx + 1} ↗
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Mandatory Human-in-the-Loop Exact Notice */}
          <div className="ws-workbench-notice" role="note">
            <span className="ws-workbench-notice-icon">ℹ</span>
            <p className="ws-workbench-notice-text">
              This brief is a starting point, not a solution. Read the linked issue and repository
              guidance before changing code.
            </p>
          </div>

          <EvidenceTrail
            items={evidenceItems}
            title="Brief Evidence Trail"
          />

          {/* Action Cluster */}
          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleOpenWorkbench}
              aria-label="I have read this — open workbench"
            >
              I have read this — open workbench
            </button>

            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ws-button-secondary"
              aria-label="Open on GitHub"
            >
              Open on GitHub ↗
            </a>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToIssues}
            >
              Back to candidate issues
            </button>

            <button
              type="button"
              className="ws-button-secondary"
              onClick={onReset}
            >
              New session
            </button>
          </div>

          <WhatHappensNext
            stepName="Draft work plan & source review"
            description="Next: Open the workbench to verify retrieved source files and draft a minimal patch."
          />
        </div>
      )}
    </div>
  );
};
