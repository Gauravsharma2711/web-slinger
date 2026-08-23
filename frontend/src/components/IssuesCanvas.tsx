/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import React, { useState, useEffect, useCallback } from 'react';
import {
  SessionDocument,
  NormalizedIssue,
  GetSessionIssuesResponse,
  findCompanyById,
  findCompanyByName,
} from '@web-slinger/shared';
import { getSessionIssues, GetSessionIssuesError } from '../api/sessions.js';
import { StageContextPanel } from './StageContextPanel.js';
import { EvidenceTrail, EvidenceItem } from './EvidenceTrail.js';
import { WhatHappensNext } from './WhatHappensNext.js';

export interface IssuesCanvasProps {
  session: SessionDocument;
  initialRepo?: string | null;
  onBackToOpportunities: () => void;
  onSelectIssue?: (issue: NormalizedIssue) => void;
  onReset: () => void;
}

export const IssuesCanvas: React.FC<IssuesCanvasProps> = ({
  session,
  initialRepo = null,
  onBackToOpportunities,
  onSelectIssue,
  onReset,
}) => {
  // 1. Read already persisted selectedCompanyId and selectedJobId / selectedJob from active session
  const selectedCompanyId =
    session.selectedCompanyId ||
    session.selected_company_id ||
    session.selected_job?.company_id ||
    (session as unknown as { selectedJob?: { company_id?: string; companyName?: string } })?.selectedJob?.company_id ||
    session.research_results?.[0]?.company_id;

  const catalogCompany =
    findCompanyById(selectedCompanyId) ||
    findCompanyByName(selectedCompanyId) ||
    findCompanyById(session.research_results?.[0]?.company_id) ||
    findCompanyByName(session.research_results?.[0]?.company_name) ||
    findCompanyById('cloudflare');

  const companyName =
    catalogCompany?.name ||
    session.selected_job?.company_name ||
    (session as unknown as { selectedJob?: { company_name?: string } })?.selectedJob?.company_name ||
    'Company';

  const selectedJob =
    session.selected_job ||
    (session as unknown as { selectedJob?: { role_title?: string; roleTitle?: string } })?.selectedJob ||
    session.research_results?.find(
      (r) => r.job_id === (session.selectedJobId || session.selected_job_id)
    ) ||
    session.research_results?.[0];

  const roleTitle =
    selectedJob?.role_title ||
    (selectedJob as unknown as { roleTitle?: string })?.roleTitle ||
    'Engineering Role';

  // Repositories configured for that exact company
  const candidateRepositories = catalogCompany?.candidateRepositories || [];

  const [selectedRepo, setSelectedRepo] = useState<string | null>(initialRepo);
  const [issuesData, setIssuesData] = useState<GetSessionIssuesResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [understandNotice, setUnderstandNotice] = useState<string | null>(null);

  const fetchIssuesForRepo = useCallback(
    async (repoFullName: string, forceRefresh = false) => {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);
      const [owner, repo] = repoFullName.split('/');

      try {
        const response = await getSessionIssues(session.session_id, {
          owner,
          repo,
          forceRefresh,
        });
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
    if (initialRepo) {
      fetchIssuesForRepo(initialRepo, false);
    }
  }, [initialRepo, fetchIssuesForRepo]);

  const handleSelectRepo = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    fetchIssuesForRepo(repoFullName, false);
  };

  const handleChooseAnotherRepo = () => {
    setSelectedRepo(null);
    setIssuesData(null);
    setErrorStatus(null);
    setErrorMessage(null);
    setSelectedIssueId(null);
    setUnderstandNotice(null);
  };

  const handleUnderstandIssue = (issue: NormalizedIssue) => {
    setSelectedIssueId(issue.id);
    setUnderstandNotice(`Issue #${issue.number} selected.`);
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

  // Build real evidence items from loaded candidate issues
  const evidenceItems: EvidenceItem[] = issues.slice(0, 4).map((i) => ({
    type: 'issue',
    label: `#${i.number} • ${i.title}`,
    detail: `${i.tier === 'A' ? 'Strong first option' : 'Needs more reading'} • ${i.labels.slice(0, 2).join(', ') || 'open issue'}`,
    url: i.html_url,
  }));

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <button
            type="button"
            className="ws-back-button"
            onClick={onBackToOpportunities}
            aria-label="Back to opportunities"
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
        <details className="ws-details-section" style={{ margin: 0, width: 'auto' }}>
          <summary className="ws-details-summary">Details</summary>
          <div className="ws-details-content">
            <div>Valid for: 24 hours</div>
          </div>
        </details>
      </div>

      {/* 7. Breadcrumb: Company → chosen role → repository */}
      <nav
        className="ws-breadcrumb"
        data-testid="breadcrumb"
        aria-label="Breadcrumb"
        style={{
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: 'var(--ws-muted)',
          flexWrap: 'wrap',
          background: 'var(--ws-surface)',
          padding: '8px 14px',
          borderRadius: '6px',
          border: '1px solid var(--ws-rule)',
        }}
      >
        <span className="ws-breadcrumb-item ws-breadcrumb-company" style={{ color: 'var(--ws-ink)', fontWeight: 600 }}>
          {companyName}
        </span>
        <span className="ws-breadcrumb-separator" aria-hidden="true" style={{ color: 'var(--ws-muted)' }}>
          →
        </span>
        <span className="ws-breadcrumb-item ws-breadcrumb-role" style={{ color: 'var(--ws-ink-soft)' }}>
          {roleTitle}
        </span>
        <span className="ws-breadcrumb-separator" aria-hidden="true" style={{ color: 'var(--ws-muted)' }}>
          →
        </span>
        <span
          className="ws-breadcrumb-item ws-breadcrumb-repo"
          style={{ color: selectedRepo ? '#15803d' : 'var(--ws-muted)', fontWeight: selectedRepo ? 600 : 400 }}
        >
          {selectedRepo || 'repository'}
        </span>
      </nav>

      {/* 1. REPOSITORY SELECTION VIEW (User chooses repository before any issue request begins) */}
      {!selectedRepo && (
        <div data-testid="repository-selection-view">
          <div className="ws-title-group" style={{ marginBottom: '20px' }}>
            <h1 className="ws-prompt-heading">Choose a verified repository from {companyName}</h1>
            <p className="ws-prompt-description">
              Select one of the verified open-source repositories to discover candidate issues.
            </p>
          </div>

          <div
            className="ws-repositories-grid"
            role="list"
            aria-label={`Verified repositories for ${companyName}`}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}
          >
            {candidateRepositories.map((repoFullName, index) => (
              <article
                key={repoFullName}
                className="ws-card ws-repo-card"
                data-testid={`repo-card-${index}`}
                role="listitem"
                style={{
                  background: 'var(--ws-surface)',
                  border: '1px solid var(--ws-rule)',
                  borderRadius: '8px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ws-ink)', margin: 0, fontFamily: 'var(--ws-font-mono)' }}>
                    {repoFullName}
                  </h2>
                  <span
                    className="ws-badge ws-badge-verified"
                    data-testid={`verified-repo-badge-${index}`}
                    style={{
                      background: '#f0fdf4',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    Verified company repository
                  </span>
                </div>

                <p style={{ color: 'var(--ws-muted)', fontSize: '14px', margin: 0, lineHeight: 1.4 }}>
                  Official open-source repository for {companyName}. Verified for public candidate issue discovery.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="ws-button-primary"
                    data-testid={`choose-repo-btn-${index}`}
                    onClick={() => handleSelectRepo(repoFullName)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '13px',
                    }}
                  >
                    Choose this repository →
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-6)' }}>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={onBackToOpportunities}
            >
              ← Back to opportunities
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

      {/* 2. LOADING STATE */}
      {selectedRepo && isLoading && (
        <div role="status" aria-live="polite">
          <h1 className="ws-prompt-heading">Finding candidate issues...</h1>
          <div className="ws-status-block">
            <div className="ws-status-indicator" />
            <p className="ws-status-sentence">
              Scanning target repository for open candidate issues matching your stack...
            </p>
          </div>
        </div>
      )}

      {/* 3. RATE LIMITED STATE */}
      {selectedRepo && !isLoading && isRateLimited && (
        <div role="alert">
          <h1 className="ws-prompt-heading">GitHub rate limit reached.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">Rate limit exceeded</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || 'The public GitHub API rate limit has been reached for this server.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your research session and selected technologies are saved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Please wait a moment and click Retry, or return to choose another repository.
            </p>
          </div>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => fetchIssuesForRepo(selectedRepo, true)}
            >
              Retry
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleChooseAnotherRepo}
            >
              Choose another repository
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

      {/* 4. REPOSITORY NOT FOUND STATE */}
      {selectedRepo && !isLoading && !isRateLimited && isNotFound && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Repository unavailable.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">Repository not found</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || 'The target repository could not be located on GitHub.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your session and chosen stack are saved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Return to choose another company repository.
            </p>
          </div>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={handleChooseAnotherRepo}
            >
              Choose another repository
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

      {/* 5. GENERIC DEGRADED / ERROR STATE */}
      {selectedRepo && !isLoading && !isRateLimited && !isNotFound && isDegraded && (
        <div role="alert">
          <h1 className="ws-prompt-heading">Could not load candidate issues.</h1>
          <div className="ws-error-card">
            <div className="ws-error-title">Source retrieval paused</div>
            <p className="ws-error-body">
              <strong>What happened:</strong> {errorMessage || 'Public source discovery encountered an unexpected issue while retrieving issues.'}
            </p>
            <p className="ws-error-body">
              <strong>What is saved:</strong> Your session and research opportunities are saved.
            </p>
            <p className="ws-error-body">
              <strong>Next action:</strong> Click Retry to scan again or return to choose another repository.
            </p>
          </div>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              onClick={() => fetchIssuesForRepo(selectedRepo, true)}
            >
              Retry
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleChooseAnotherRepo}
            >
              Choose another repository
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

      {/* 6. NO-ISSUE / EMPTY STATE: Exactly displays requirement 8 string */}
      {selectedRepo && !isLoading && !isRateLimited && !isNotFound && !isDegraded && issues.length === 0 && (
        <div data-testid="no-issues-container">
          <h1 className="ws-prompt-heading" data-testid="no-issues-heading">
            No suitable issue found in this repository. Choose another company repository.
          </h1>
          <p className="ws-prompt-description">
            No open candidate issues were discovered for repository <code>{selectedRepo}</code>.
          </p>
          <div className="ws-actions">
            <button
              type="button"
              className="ws-button-primary"
              data-testid="choose-another-repo-btn"
              onClick={handleChooseAnotherRepo}
            >
              Choose another company repository
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={() => fetchIssuesForRepo(selectedRepo, true)}
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

      {/* 7. SUCCESSFUL ISSUES LIST (Up to 5 candidate issues from chosen repository) */}
      {selectedRepo && !isLoading && !isRateLimited && !isNotFound && !isDegraded && issues.length > 0 && (
        <div>
          <div className="ws-title-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 className="ws-prompt-heading">Which issue would you like to investigate?</h1>
              <p className="ws-prompt-description">
                Select an open-source issue from <code>{selectedRepo}</code> to read its context brief and verify requirements.
              </p>
            </div>
            <button
              type="button"
              className="ws-button-secondary"
              data-testid="change-repo-btn"
              onClick={handleChooseAnotherRepo}
              style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px' }}
            >
              ← Choose another company repository
            </button>
          </div>

          <StageContextPanel
            stage="Choose"
            rankingNote="Ranked deterministically by stack alignment, good first issue labels, and documented contribution guidance."
            relationshipLabel={issues[0]?.repository_relationship_label}
          />

          {/* Fixture Mode Alert Banner */}
          {isFixture && (
            <div className="ws-fixture-banner" role="status">
              <span className="ws-fixture-badge">Sample</span>
              <span>Sample candidate issues loaded for demonstration.</span>
            </div>
          )}

          {/* Context Brief Selection Notice */}
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
                  {/* Header Row: Classification Badge + Repo Identity + Updated Time */}
                  <div className="ws-issue-card-header">
                    <div className="ws-issue-card-header-left">
                      <span
                        className={
                          issue.tier === 'A' ? 'ws-tier-badge-a' : 'ws-tier-badge-b'
                        }
                      >
                        {issue.tier === 'A' ? 'Strong first option' : 'Needs more reading'}
                      </span>
                      {issue.is_fixture && (
                        <span className="ws-fixture-badge">Sample</span>
                      )}
                      <span className="ws-issue-repo">
                        {issuesData?.owner || selectedRepo.split('/')[0]}/{issuesData?.repo || selectedRepo.split('/')[1]}
                      </span>
                      {issue.repository_relationship_label && (
                        <span className="ws-repo-relation-badge">
                          {issue.repository_relationship_label}
                        </span>
                      )}
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

                  {/* Triage Assessment Reasons */}
                  {issue.reasons.length > 0 && (
                    <div className="ws-issue-reasons-box">
                      <span className="ws-reasons-heading">Assessment</span>
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
                      {isSelected ? 'Selected' : 'Understand this issue'}
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

          <EvidenceTrail
            items={evidenceItems}
            title="Candidate Issue Evidence"
          />

          <div className="ws-actions" style={{ marginTop: 'var(--ws-space-8)' }}>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={handleChooseAnotherRepo}
            >
              Choose another repository
            </button>
            <button
              type="button"
              className="ws-button-secondary"
              onClick={() => fetchIssuesForRepo(selectedRepo, true)}
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

          <WhatHappensNext
            stepName="Understand context brief"
            description="Next: Read the grounded context brief with verified problem constraints and identified unknowns."
          />
        </div>
      )}
    </div>
  );
};
