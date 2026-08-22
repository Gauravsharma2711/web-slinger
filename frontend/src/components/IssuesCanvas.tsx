/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  GetSessionIssuesResponse,
} from '@web-slinger/shared';
import { getSessionIssues, GetSessionIssuesError } from '../api/sessions.js';

export interface IssuesCanvasProps {
  session: SessionDocument;
  onBackToOpportunities: () => void;
  onSelectIssue?: (issue: NormalizedIssue) => void;
  onReset: () => void;
}

export const IssuesCanvas: React.FC<IssuesCanvasProps> = ({
  session,
  onBackToOpportunities,
  onSelectIssue,
  onReset,
}) => {
  const [issuesData, setIssuesData] = useState<GetSessionIssuesResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [understandNotice, setUnderstandNotice] = useState<string | null>(null);

  const fetchIssues = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      try {
        const response = await getSessionIssues(session.session_id, { forceRefresh });
        setIssuesData(response);
      } catch (err: unknown) {
        const fetchErr = err as GetSessionIssuesError;
        setErrorStatus(fetchErr.status || 500);
        setErrorMessage(fetchErr.message || 'Unable to load candidate issues from public source.');
      } finally {
        setIsLoading(false);
      }
    },
    [session.session_id]
  );

  useEffect(() => {
    fetchIssues(false);
  }, [fetchIssues]);

  const handleUnderstandIssue = (issue: NormalizedIssue) => {
    setSelectedIssueId(issue.id);
    setUnderstandNotice(
      `Issue #${issue.number} selected.`
    );
    if (onSelectIssue) {
      onSelectIssue(issue);
    }
  };

  const isRateLimited = errorStatus === 403 || issuesData?.status === 'rate_limited';
  const isNotFound = errorStatus === 404 || issuesData?.status === 'not_found';
  const isDegraded =
    Boolean(errorStatus && errorStatus >= 500) ||
    issuesData?.status === 'degraded' ||
    issuesData?.status === 'failed';
  const issues = issuesData?.issues || [];
  const isFixture = issuesData?.is_fixture || issues.some((i) => i.is_fixture);

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <button
            type="button"
            className="ws-back-button"
            onClick={onBackToOpportunities}
            aria-label="Back to discovered opportunities"
          >
            ← Back to opportunities
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

      {/* 1. LOADING STATE */}
      {isLoading && (
        <div role="status" aria-live="polite">
          <h1 className="ws-prompt-heading">Discovering candidate issues.</h1>
          <div className="ws-status-block">
            <div className="ws-status-indicator" />
            <p className="ws-status-sentence">
              Scanning target repository for open candidate issues and applying deterministic triage...
            </p>
          </div>
        </div>
      )}

      {/* 2. RATE LIMITED STATE */}
      {!isLoading && isRateLimited && (
        <div role="alert">
          <h1 className="ws-prompt-heading">GitHub rate limit reached.</h1>
          <p className="ws-prompt-description">
            {errorMessage ||
              'The public GitHub API rate limit has been reached for this server IP. Please wait for the rate limit to reset or retry in a moment.'}
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => fetchIssues(true)}
            >
              Retry discovery
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToOpportunities}
            >
              Back to opportunities
            </button>
          </div>
        </div>
      )}

      {/* 3. REPOSITORY NOT FOUND STATE */}
      {!isLoading && !isRateLimited && isNotFound && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Repository unavailable.</h1>
          <p className="ws-prompt-description">
            {errorMessage ||
              'The target GitHub repository could not be located or is not accessible with current public permissions.'}
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={onBackToOpportunities}
            >
              Back to opportunities
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

      {/* 4. GENERIC DEGRADED / ERROR STATE */}
      {!isLoading && !isRateLimited && !isNotFound && isDegraded && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Issue discovery notice.</h1>
          <p className="ws-prompt-description">
            {errorMessage ||
              'Public source discovery encountered an unexpected issue while retrieving candidate issues.'}
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => fetchIssues(true)}
            >
              Retry discovery
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToOpportunities}
            >
              Back to opportunities
            </button>
          </div>
        </div>
      )}

      {/* 5. EMPTY STATE */}
      {!isLoading && !isRateLimited && !isNotFound && !isDegraded && issues.length === 0 && (
        <div>
          <h1 className="ws-prompt-heading">No candidate issues found.</h1>
          <p className="ws-prompt-description">
            No open candidate issues were discovered for repository{' '}
            <code>
              {issuesData?.owner}/{issuesData?.repo}
            </code>
            .
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => fetchIssues(true)}
            >
              Refresh issues
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToOpportunities}
            >
              Back to opportunities
            </button>
          </div>
        </div>
      )}

      {/* 6. SUCCESSFUL ISSUES LIST */}
      {!isLoading && !isRateLimited && !isNotFound && !isDegraded && issues.length > 0 && (
        <div>
          <div className="ws-title-group">
            <h1 className="ws-prompt-heading">Candidate issues.</h1>
            <p className="ws-prompt-description">
              Public open-source issues triaged against your target profile. Tiers are classification
              labels indicating community onboarding scope, not guarantees of acceptance.
            </p>
          </div>

          {/* Fixture Mode Alert Banner */}
          {isFixture && (
            <div className="ws-fixture-banner" role="status">
              <span className="ws-fixture-badge">Demo fixture</span>
              <span>
                Simulated candidate issues loaded for demonstration. No live GitHub call was made.
              </span>
            </div>
          )}

          {/* Context Brief Selection Notice (Day 4 Hand-off) */}
          {understandNotice && (
            <div className="ws-notice-banner" role="status" aria-live="polite">
              <span className="ws-notice-dot" />
              <span>{understandNotice}</span>
            </div>
          )}

          {/* Candidate Issues List */}
          <div className="ws-issue-list" role="list" aria-label="Candidate GitHub issues">
            {issues.map((issue) => {
              const isSelected = selectedIssueId === issue.id;
              const formattedDate = new Date(issue.updated_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <article
                  key={issue.id}
                  className={`ws-issue-card ${isSelected ? 'selected' : ''}`}
                  role="listitem"
                  aria-labelledby={`issue-title-${issue.id}`}
                >
                  {/* Header Row: Tier Badge + Repo Identity + Updated Time */}
                  <div className="ws-issue-card-header">
                    <div className="ws-issue-card-header-left">
                      <span
                        className={
                          issue.tier === 'A' ? 'ws-tier-badge-a' : 'ws-tier-badge-b'
                        }
                      >
                        TIER {issue.tier} • {issue.tier === 'A' ? 'Onboarding Scope' : 'Standard Scope'}
                      </span>
                      {issue.is_fixture && (
                        <span className="ws-fixture-badge">Demo fixture</span>
                      )}
                      <span className="ws-issue-repo">
                        {issuesData?.owner}/{issuesData?.repo}
                      </span>
                    </div>
                    <span className="ws-issue-timestamp">Updated {formattedDate}</span>
                  </div>

                  {/* Title & Number */}
                  <h2 id={`issue-title-${issue.id}`} className="ws-issue-card-title">
                    <span className="ws-issue-number">#{issue.number}</span> {issue.title}
                  </h2>

                  {/* Label Chips */}
                  {issue.labels.length > 0 && (
                    <div className="ws-issue-labels" aria-label="Issue labels">
                      {issue.labels.map((label) => (
                        <span key={label} className="ws-issue-label-chip">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Deterministic Explanation Reasons */}
                  {issue.reasons.length > 0 && (
                    <div className="ws-issue-reasons-box">
                      <span className="ws-reasons-heading">Triage Assessment</span>
                      <ul className="ws-reasons-list">
                        {issue.reasons.map((reason, idx) => (
                          <li key={idx} className="ws-reason-item">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="ws-issue-card-actions">
                    <button
                      type="button"
                      className="ws-button-primary"
                      onClick={() => handleUnderstandIssue(issue)}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? 'Selected for analysis' : 'Understand this issue'}
                    </button>

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
                </article>
              );
            })}
          </div>

          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-8)' }}>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={() => fetchIssues(true)}
            >
              Refresh issues
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToOpportunities}
            >
              Back to opportunities
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
