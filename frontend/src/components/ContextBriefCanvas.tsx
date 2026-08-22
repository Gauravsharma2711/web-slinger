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

export interface ContextBriefCanvasProps {
  session: SessionDocument;
  issue: NormalizedIssue;
  onBackToIssues: () => void;
  onReset: () => void;
}

export const ContextBriefCanvas: React.FC<ContextBriefCanvasProps> = ({
  session,
  issue,
  onBackToIssues,
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
    setWorkbenchMessage(
      'Brief verified. The Staged Workbench (Context → Proposal → Verification) unlocks in Day 4.'
    );
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

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <button
            type="button"
            className="ws-back-button"
            onClick={onBackToIssues}
            aria-label="Back to candidate issues list"
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
        <span className="ws-session-indicator">
          SESSION ACTIVE • ID: {session.session_id.slice(0, 8)}... • 24H TTL
        </span>
      </div>

      {/* 1. LOADING / GENERATING STATE */}
      {isLoading && (
        <div role="status" aria-live="polite">
          <h1 className="ws-prompt-heading">Generating context brief.</h1>
          <div className="ws-status-block">
            <div className="ws-status-indicator" />
            <p className="ws-status-sentence">
              Retrieving issue #{issue.number}, recent comments, and repository guidelines to synthesize
              an evidence-grounded brief...
            </p>
          </div>
        </div>
      )}

      {/* 2. VERTEX UNAVAILABLE STATE */}
      {!isLoading && isVertexError && (
        <div role="alert">
          <h1 className="ws-prompt-heading">AI model unavailable.</h1>
          <p className="ws-prompt-description">
            {errorMessage ||
              'The Vertex AI model service encountered a temporary connection issue. Your session data is preserved.'}
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => loadOrGenerateBrief(true)}
            >
              Retry brief generation
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

      {/* 3. GITHUB SOURCE UNAVAILABLE STATE */}
      {!isLoading && !isVertexError && isSourceUnavailable && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Source unavailable.</h1>
          <p className="ws-prompt-description">
            {errorMessage ||
              `Could not retrieve public issue #${issue.number} or related repository documentation from GitHub.`}
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => loadOrGenerateBrief(true)}
            >
              Retry retrieval
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

      {/* 4. NEEDS REVIEW STATE */}
      {!isLoading && !isVertexError && !isSourceUnavailable && isNeedsReview && !brief && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Context brief needs review.</h1>
          <p className="ws-prompt-description">
            The generated brief contained unverified assertions, missing citations, or could not be
            strictly validated against the source pack.
          </p>

          {briefResponse?.validation_errors && briefResponse.validation_errors.length > 0 && (
            <div className="ws-issue-reasons-box" style={{ marginBottom: 'var(--ws-space-6)' }}>
              <span className="ws-reasons-heading">Validation Warnings</span>
              <ul className="ws-reasons-list">
                {briefResponse.validation_errors.map((err, idx) => (
                  <li key={idx} className="ws-reason-item">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
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
          {/* Fixture Mode Alert Banner */}
          {isFixture && (
            <div className="ws-fixture-banner" role="status">
              <span className="ws-fixture-badge">Demo fixture</span>
              <span>
                Simulated context brief loaded for demonstration. No live Vertex AI call was made.
              </span>
            </div>
          )}

          {/* Validation Notice if partially degraded but brief readable */}
          {isNeedsReview && (
            <div className="ws-fixture-banner" style={{ borderColor: 'var(--ws-warning)' }} role="status">
              <span className="ws-fixture-badge">Needs human review</span>
              <span>
                Some citations or links require verification. Read source documents carefully.
              </span>
            </div>
          )}

          {/* Workbench Acknowledgment Notice */}
          {workbenchMessage && (
            <div className="ws-notice-banner" role="status" aria-live="polite">
              <span className="ws-notice-dot" />
              <span>{workbenchMessage}</span>
            </div>
          )}

          {/* Item 1: Evidence Label */}
          <div className="ws-brief-meta-row">
            <span className="ws-brief-evidence-badge">
              SOURCE-GROUNDED CONTEXT BRIEF • {briefResponse?.model_id || 'GEMINI 3.7 FLASH'} •{' '}
              {briefResponse?.sources.length ?? 1} SOURCES CITED
            </span>
            {isFixture && <span className="ws-fixture-badge">Demo fixture</span>}
          </div>

          {/* Item 2: Issue Title and Number */}
          <h1 className="ws-prompt-heading" style={{ marginTop: 'var(--ws-space-2)' }}>
            <span className="ws-issue-number">#{issue.number}</span> {issue.title}
          </h1>

          {/* Item 3: Source GitHub Link */}
          <div className="ws-brief-link-row">
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

          {/* Action Cluster (Requirement 4) */}
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
        </div>
      )}
    </div>
  );
};
