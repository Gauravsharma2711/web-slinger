/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState } from 'react';
import {
  SessionDocument,
  SessionStatusResponse,
} from '@web-slinger/shared';
import { StageContextPanel } from './StageContextPanel.js';
import { EvidenceTrail, EvidenceItem } from './EvidenceTrail.js';
import { WhatHappensNext } from './WhatHappensNext.js';

export interface ResearchCanvasProps {
  session: SessionDocument;
  sessionStatus: SessionStatusResponse | null;
  isStartingResearch: boolean;
  errorMessage: string | null;
  onStartResearch: () => void;
  onRetryResearch: (forceNew?: boolean) => void;
  onExploreIssues?: () => void;
  onReset: () => void;
}

const RESEARCH_STEPS = [
  'Initializing research parameters',
  'Querying live Bright Data collector',
  'Normalizing matching job records',
  'Scoring relevance & deduplicating',
  'Preparing top 5 opportunities',
];

export const ResearchCanvas: React.FC<ResearchCanvasProps> = ({
  session,
  sessionStatus,
  isStartingResearch,
  errorMessage,
  onStartResearch,
  onRetryResearch,
  onExploreIssues,
  onReset,
}) => {
  const [showAllResults, setShowAllResults] = useState<boolean>(false);

  const currentJob = sessionStatus?.current_job;
  const isRunning =
    isStartingResearch ||
    currentJob?.status === 'queued' ||
    currentJob?.status === 'running';
  const isCompleted = currentJob?.status === 'completed';
  const isDegraded = currentJob?.status === 'degraded' || currentJob?.status === 'failed';
  const isInitialCreated = !isRunning && !isCompleted && !isDegraded;

  const results = sessionStatus?.research_results || session.research_results || [];
  const displayedResults = showAllResults ? results : results.slice(0, 5);
  const hasExistingSnapshot = Boolean(sessionStatus?.snapshot_id || session.snapshot_id);

  // Build real evidence items from completed job results
  const evidenceItems: EvidenceItem[] = displayedResults.slice(0, 4).map((r) => ({
    type: 'job',
    label: `${r.role_title} • ${r.company_name}`,
    detail: r.location || 'Public job posting',
    url: r.source_url,
  }));

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-stack-chips">
          {session.stack.map((item) => (
            <span key={item} className="ws-chip">
              {item}
            </span>
          ))}
        </div>
        <details className="ws-details-section" style={{ margin: 0, width: 'auto' }}>
          <summary className="ws-details-summary">Details</summary>
          <div className="ws-details-content">
            <div>Valid for: 24 hours</div>
          </div>
        </details>
      </div>

      {/* 1. RUNNING / QUEUED STATE */}
      {isRunning && (() => {
        const stackList = session.stack.length > 0 ? session.stack : sessionStatus?.stack || [];
        const stackLabel = stackList.length > 0 ? stackList.join(' + ') : 'your target stack';
        return (
          <div>
            <h1 className="ws-prompt-heading">Searching for matching opportunities...</h1>
            <div className="ws-status-block" role="status" aria-live="polite">
              <div className="ws-status-indicator" />
              <p className="ws-status-sentence">
                Collecting live public job listings for {stackLabel}. Preserving your search parameters.
              </p>
            </div>

            {/* Quiet 5-step Linear Loading Trail */}
            <div className="ws-research-steps-trail" aria-label="Research progress sequence">
              <h4 className="ws-research-steps-title">Research Pipeline</h4>
              {RESEARCH_STEPS.map((stepName, idx) => {
                const isActive = idx === 1 || idx === 2; // Active querying/normalizing phase
                const isDone = idx === 0;
                return (
                  <div
                    key={stepName}
                    className={`ws-research-step-item ${
                      isActive ? 'ws-research-step-item-active' : isDone ? 'ws-research-step-item-done' : ''
                    }`}
                  >
                    <span className="ws-research-step-badge">{idx + 1}</span>
                    <span>{stepName}</span>
                  </div>
                );
              })}
            </div>

            <div className="ws-actions">
              <button
                type="button"
                className="ws-button-secondary"
                onClick={onReset}
              >
                Cancel session
              </button>
            </div>
          </div>
        );
      })()}

      {/* 2. COMPLETED STATE */}
      {!isRunning && isCompleted && (
        <div>
          <h1 className="ws-prompt-heading">Which opportunities match your stack?</h1>
          <p className="ws-prompt-description">
            Review the matching engineering opportunities below, then choose candidate issues to solve.
          </p>

          <StageContextPanel
            stage="Choose"
            rankingNote="Ranked deterministically by selected-stack keyword match, source completeness, and verified repository links."
          />

          <div className="ws-result-list" role="list" aria-label="Discovered opportunities">
            {displayedResults.map((item, idx) => (
              <div key={`${item.company_name}-${item.role_title}-${idx}`} className="ws-result-item" role="listitem">
                <div className="ws-result-info">
                  <div className="ws-result-company">
                    {item.company_name}
                    {item.is_fixture && (
                      <span className="ws-fixture-badge">Sample</span>
                    )}
                  </div>
                  <div className="ws-result-role">{item.role_title}</div>
                  {item.location && (
                    <div className="ws-result-location">{item.location}</div>
                  )}
                  {item.reasons && item.reasons.length > 0 && (
                    <div className="ws-reasons-list">
                      {item.reasons.map((reason, rIdx) => (
                        <span key={rIdx} className="ws-reason-tag">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ws-source-link"
                  aria-label={`View source listing for ${item.role_title} at ${item.company_name}`}
                >
                  View Source ↗
                </a>
              </div>
            ))}
          </div>

          {results.length > 5 && (
            <div style={{ marginTop: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}>
              <button
                type="button"
                className="ws-quiet-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => setShowAllResults(!showAllResults)}
              >
                {showAllResults
                  ? `Show top 5 only (5 of ${results.length})`
                  : `Show all ${results.length} opportunities (${results.length - 5} more)`}
              </button>
            </div>
          )}

          <EvidenceTrail
            items={evidenceItems}
            title="Public Job Evidence"
          />

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onExploreIssues}
            >
              Find candidate issues
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
            stepName="Choose candidate open-source issues"
            description="Next: Select from verified issues matching the discovered tech stack and contribution guidance."
          />
        </div>
      )}

      {/* 3. DEGRADED / FAILED STATE */}
      {!isRunning && isDegraded && (
        <div>
          <h1 className="ws-prompt-heading">Opportunity search paused.</h1>

          <div className="ws-error-card" role="alert">
            <div className="ws-error-title">Search interrupted</div>
            <p className="ws-error-body">
              <strong>What happened:</strong>{' '}
              {currentJob?.message || errorMessage || 'The opportunity search timed out or encountered an issue.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your selected stack and search session are preserved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Click Resume search or explore candidate issues directly.
            </p>
          </div>

          {results.length > 0 && (
            <>
              <div className="ws-result-list" role="list" aria-label="Fallback opportunities">
                {displayedResults.map((item, idx) => (
                  <div key={`${item.company_name}-${item.role_title}-${idx}`} className="ws-result-item" role="listitem">
                    <div className="ws-result-info">
                      <div className="ws-result-company">
                        {item.company_name}
                        {item.is_fixture && (
                          <span className="ws-fixture-badge">Sample</span>
                        )}
                      </div>
                      <div className="ws-result-role">{item.role_title}</div>
                      {item.location && (
                        <div className="ws-result-location">{item.location}</div>
                      )}
                      {item.reasons && item.reasons.length > 0 && (
                        <div className="ws-reasons-list">
                          {item.reasons.map((reason, rIdx) => (
                            <span key={rIdx} className="ws-reason-tag">
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-source-link"
                    >
                      View Source ↗
                    </a>
                  </div>
                ))}
              </div>

              {results.length > 5 && (
                <div style={{ marginTop: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}>
                  <button
                    type="button"
                    className="ws-quiet-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => setShowAllResults(!showAllResults)}
                  >
                    {showAllResults
                      ? `Show top 5 only (5 of ${results.length})`
                      : `Show all ${results.length} opportunities (${results.length - 5} more)`}
                  </button>
                </div>
              )}
            </>
          )}

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => onRetryResearch(false)}
            >
              {hasExistingSnapshot ? 'Resume search' : 'Retry search'}
            </button>

            {hasExistingSnapshot && (
              <button
                type="button"
                className="ws-button-secondary"
                onClick={() => onRetryResearch(true)}
              >
                Start new search
              </button>
            )}

            {results.length > 0 && onExploreIssues && (
              <button
                type="button"
                className="ws-button-secondary"
                onClick={onExploreIssues}
              >
                Find candidate issues
              </button>
            )}

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

      {/* 4. INITIAL CREATED STATE */}
      {isInitialCreated && (
        <div>
          <h1 className="ws-prompt-heading">Ready to search for opportunities?</h1>
          <p className="ws-prompt-description">
            Scan public career sources for real engineering opportunities matching your technologies.
          </p>

          <StageContextPanel
            stage="Discover"
            stack={session.stack}
            customExplanation="Ready to search public engineering listings for your selected stack."
          />

          {errorMessage && (
            <div className="ws-error-card" role="alert">
              <div className="ws-error-title">Search Notice</div>
              <p className="ws-error-body"><strong>What happened:</strong> {errorMessage}</p>
              <p className="ws-error-body"><strong>What is saved:</strong> Your selected stack is saved.</p>
              <p className="ws-error-body"><strong>Next action:</strong> Click Search opportunities to begin.</p>
            </div>
          )}

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onStartResearch}
              disabled={isStartingResearch}
            >
              {isStartingResearch ? 'Starting search...' : 'Search opportunities'}
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
            stepName="Choose"
            description="After search completes, review the top 5 ranked opportunities with direct source links."
          />
        </div>
      )}
    </div>
  );
};

