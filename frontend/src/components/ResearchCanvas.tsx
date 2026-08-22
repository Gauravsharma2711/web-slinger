/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React from 'react';
import {
  SessionDocument,
  SessionStatusResponse,
} from '@web-slinger/shared';

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
  const currentJob = sessionStatus?.current_job;
  const isRunning =
    isStartingResearch ||
    currentJob?.status === 'queued' ||
    currentJob?.status === 'running';
  const isCompleted = currentJob?.status === 'completed';
  const isDegraded = currentJob?.status === 'degraded' || currentJob?.status === 'failed';
  const isInitialCreated = !isRunning && !isCompleted && !isDegraded;

  const results = sessionStatus?.research_results || session.research_results || [];
  const hasExistingSnapshot = Boolean(sessionStatus?.snapshot_id || session.snapshot_id);

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
        <span className="ws-session-indicator">
          SESSION ACTIVE • ID: {session.session_id.slice(0, 8)}... • 24H TTL
        </span>
      </div>

      {/* 1. RUNNING / QUEUED STATE */}
      {isRunning && (() => {
        const stackList = session.stack.length > 0 ? session.stack : sessionStatus?.stack || [];
        const stackLabel = stackList.length > 0 ? stackList.join(' + ') : 'your target stack';
        return (
          <div>
            <h1 className="ws-prompt-heading">Researching opportunities.</h1>
            <div className="ws-status-block" role="status" aria-live="polite">
              <div className="ws-status-indicator" />
              <p className="ws-status-sentence">
                Collecting live public job listings for {stackLabel}. This can take a few minutes.
              </p>
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
          <h1 className="ws-prompt-heading">Opportunities found.</h1>
          <p className="ws-prompt-description">
            Public job postings matched to your target stack. Source citations and URLs are
            preserved.
          </p>

          <div className="ws-result-list" role="list" aria-label="Discovered opportunities">
            {results.map((item, idx) => (
              <div key={`${item.company_name}-${idx}`} className="ws-result-item" role="listitem">
                <div className="ws-result-info">
                  <div className="ws-result-company">
                    {item.company_name}
                    {item.is_fixture && (
                      <span className="ws-fixture-badge">[DEMO FIXTURE]</span>
                    )}
                  </div>
                  <div className="ws-result-role">{item.role_title}</div>
                  {item.location && (
                    <div className="ws-result-location">{item.location}</div>
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

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onExploreIssues}
            >
              Explore candidate issues
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

      {/* 3. DEGRADED / FAILED STATE */}
      {!isRunning && isDegraded && (
        <div>
          <h1 className="ws-prompt-heading">Collector notice.</h1>
          <p className="ws-prompt-description">
            {currentJob?.message ||
              'Public collector encountered an issue or timed out. You can resume polling or start a new collection.'}
          </p>

          {results.length > 0 && (
            <div className="ws-result-list" role="list" aria-label="Fallback opportunities">
              {results.map((item, idx) => (
                <div key={`${item.company_name}-${idx}`} className="ws-result-item" role="listitem">
                  <div className="ws-result-info">
                    <div className="ws-result-company">
                      {item.company_name}
                      {item.is_fixture && (
                        <span className="ws-fixture-badge">[DEMO FIXTURE]</span>
                      )}
                    </div>
                    <div className="ws-result-role">{item.role_title}</div>
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
          )}

          {errorMessage && (
            <p
              style={{
                color: 'var(--ws-danger)',
                fontSize: '13px',
                margin: '0 0 var(--ws-space-4) 0',
              }}
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => onRetryResearch(false)}
            >
              {hasExistingSnapshot ? 'Resume collection' : 'Retry research'}
            </button>

            {hasExistingSnapshot && (
              <button
                type="button"
                className="ws-button-secondary"
                onClick={() => onRetryResearch(true)}
              >
                Start new research
              </button>
            )}

            {results.length > 0 && onExploreIssues && (
              <button
                type="button"
                className="ws-button-secondary"
                onClick={onExploreIssues}
              >
                Explore candidate issues
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
          <h1 className="ws-prompt-heading">Target stack confirmed.</h1>
          <p className="ws-prompt-description">
            Ready to scan public career sources for real engineering opportunities matching your
            technologies.
          </p>

          {errorMessage && (
            <p
              style={{
                color: 'var(--ws-danger)',
                fontSize: '13px',
                margin: '0 0 var(--ws-space-4) 0',
              }}
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onStartResearch}
              disabled={isStartingResearch}
            >
              {isStartingResearch ? 'Starting research...' : 'Start research'}
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
