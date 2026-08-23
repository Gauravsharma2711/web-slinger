/* Calm Multi-Company Opportunities Canvas: Top 5 diverse opportunities, company filters, persistent demo badges, and resilient calm states. */

import React, { useState, useMemo } from 'react';
import {
  SessionDocument,
  SessionStatusResponse,
  NormalizedJobResult,
  getCuratedDemoFixtures,
  selectDiverseTopJobs,
  EXACT_DEMO_FIXTURE_LABEL,
  findCompanyById,
  findCompanyByName,
  COMPANY_CATALOG,
} from '@web-slinger/shared';

export interface OpportunitiesCanvasProps {
  session: SessionDocument;
  sessionStatus: SessionStatusResponse | null;
  isDemoMode?: boolean;
  onSelectOpportunity: (job: NormalizedJobResult) => Promise<void> | void;
  onProceedToRepositories?: (companyId: string) => void;
  onCheckExistingResearch: () => void;
  onReset: () => void;
  isSelecting?: boolean;
  errorMessage?: string | null;
}

export const OpportunitiesCanvas: React.FC<OpportunitiesCanvasProps> = ({
  session,
  sessionStatus,
  isDemoMode = false,
  onSelectOpportunity,
  onProceedToRepositories,
  onCheckExistingResearch,
  onReset,
  isSelecting = false,
  errorMessage = null,
}) => {
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<NormalizedJobResult | null>(
    session.selected_job || (session as unknown as { selectedJob?: NormalizedJobResult }).selectedJob || null
  );

  // 1. Determine raw and normalized job set based on data mode
  const rawResults = useMemo<NormalizedJobResult[]>(() => {
    if (isDemoMode) {
      const demoFixtures = getCuratedDemoFixtures(session.stack, session.goal) as NormalizedJobResult[];
      return demoFixtures;
    }

    const liveResults = sessionStatus?.research_results || session.research_results || [];
    // In live mode, render opportunities only when they contain a real source URL, real timestamp, and isFixture=false
    return liveResults.filter(
      (job) =>
        !job.is_fixture &&
        !(job as { isFixture?: boolean }).isFixture &&
        Boolean(
          job.source_url &&
            (job.collected_at ||
              (job as { collectedAt?: string }).collectedAt ||
              job.listing_date ||
              (job as { retrieved_at?: string }).retrieved_at ||
              (job as { retrievedAt?: string }).retrievedAt)
        )
    );
  }, [isDemoMode, sessionStatus?.research_results, session.research_results, session.stack, session.goal]);

  // 2. Select diverse top 5 (max 2 per company)
  const diverseTop5 = useMemo<NormalizedJobResult[]>(() => {
    return selectDiverseTopJobs(rawResults, 5, 2);
  }, [rawResults]);

  // 3. Compute available companies with data in active mode for filter chips
  const availableCompanies = useMemo(() => {
    const companyIds = new Set<string>();
    for (const job of diverseTop5) {
      const cid = job.company_id || findCompanyByName(job.company_name)?.id;
      if (cid) companyIds.add(cid.toLowerCase());
    }

    return COMPANY_CATALOG.filter((c) => companyIds.has(c.id.toLowerCase()));
  }, [diverseTop5]);

  // 4. Filter visible cards by company chip
  const filteredJobs = useMemo(() => {
    if (selectedCompanyFilter === 'all') return diverseTop5;
    return diverseTop5.filter((job) => {
      const cid = (job.company_id || findCompanyByName(job.company_name)?.id || '').toLowerCase();
      return cid === selectedCompanyFilter.toLowerCase();
    });
  }, [diverseTop5, selectedCompanyFilter]);

  const hasJobs = diverseTop5.length > 0;
  const isPendingOrDegraded = !isDemoMode && !hasJobs;

  const handleChoose = async (job: NormalizedJobResult) => {
    setSelectedJob(job);
    await onSelectOpportunity(job);
  };

  const selectedCompanyName =
    selectedJob?.company_name ||
    findCompanyById(selectedJob?.company_id)?.name ||
    'the company';

  return (
    <div className="ws-page-canvas">
      {/* Session Meta Header Bar */}
      <div className="ws-meta-bar">
        <div className="ws-meta-left">
          <div className="ws-stack-chips">
            {session.stack.map((item) => (
              <span key={item} className="ws-chip">
                {item}
              </span>
            ))}
            {isDemoMode && (
              <span className="ws-badge ws-badge-demo" style={{ background: '#f4fce3', color: '#3f4b08', border: '1px solid #d9f99d', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>
                Demo Mode
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="ws-button-secondary"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Start over
        </button>
      </div>

      {errorMessage && (
        <div className="ws-banner ws-banner-error" role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px' }}>
          {errorMessage}
        </div>
      )}

      {/* Calm Degraded / Pending State ONLY for DEMO_MODE=false */}
      {isPendingOrDegraded && (
        <div className="ws-card ws-calm-state" data-testid="live-degraded-state" style={{ textAlign: 'center', padding: '32px 24px', margin: '24px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ws-ink)', marginBottom: '8px' }}>
            Live roles from Grafana Labs are temporarily unavailable. Try again shortly.
          </h2>
          <p style={{ color: 'var(--ws-muted)', fontSize: '14px', maxWidth: '520px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            The public job board connection is temporarily slow or unavailable. Your target stack and session parameters are safely preserved.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onCheckExistingResearch}
              className="ws-button-primary"
            >
              Check existing research
            </button>
            <button
              type="button"
              onClick={onReset}
              className="ws-button-secondary"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Opportunities List Flow */}
      {hasJobs && (
        <div>
          {/* Header composition */}
          <div style={{ marginBottom: '20px' }}>
            {isDemoMode ? (
              <>
                <span
                  className="ws-eyebrow"
                  data-testid="demo-step-eyebrow"
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--ws-font-mono)',
                    fontWeight: 600,
                    color: '#526b15',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '4px',
                    display: 'block',
                  }}
                >
                  Step 2 of 5 · Choose
                </span>
                <h1 className="ws-prompt-heading" style={{ margin: '0 0 6px 0' }}>
                  Pick a company to explore.
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <p className="ws-prompt-description" style={{ margin: 0 }}>
                    These labelled demo opportunities let you explore the contribution flow without waiting for live collection.
                  </p>
                  <span
                    className="ws-badge ws-badge-demo"
                    data-testid="demo-sample-badge"
                    style={{
                      background: '#f4fce3',
                      color: '#3f4b08',
                      border: '1px solid #d9f99d',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Demo samples
                  </span>
                </div>
              </>
            ) : (
              <>
                <h1 className="ws-prompt-heading" style={{ marginBottom: '6px' }}>
                  Choose an engineering opportunity
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <p className="ws-prompt-description" style={{ margin: 0 }}>
                    Select a target company role to ground your open-source contribution and practice workflow.
                  </p>
                  <span
                    className="ws-badge"
                    style={{
                      background: '#ecfdf5',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Live roles from Grafana Labs
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Filter Chips */}
          {availableCompanies.length > 1 && (
            <div className="ws-filter-bar" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedCompanyFilter('all')}
                className={`ws-filter-chip ${selectedCompanyFilter === 'all' ? 'active' : ''}`}
                style={{
                  padding: '5px 12px',
                  borderRadius: '16px',
                  fontSize: '13px',
                  border: '1px solid',
                  borderColor: selectedCompanyFilter === 'all' ? 'var(--ws-ink)' : 'var(--ws-rule)',
                  background: selectedCompanyFilter === 'all' ? 'var(--ws-ink)' : 'var(--ws-surface)',
                  color: selectedCompanyFilter === 'all' ? '#ffffff' : 'var(--ws-ink-soft)',
                  cursor: 'pointer',
                  fontWeight: selectedCompanyFilter === 'all' ? 600 : 400,
                }}
              >
                All companies ({diverseTop5.length})
              </button>
              {availableCompanies.map((comp) => {
                const count = diverseTop5.filter(
                  (j) => (j.company_id || findCompanyByName(j.company_name)?.id)?.toLowerCase() === comp.id.toLowerCase()
                ).length;
                const isActive = selectedCompanyFilter === comp.id;
                return (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => setSelectedCompanyFilter(comp.id)}
                    className={`ws-filter-chip ${isActive ? 'active' : ''}`}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '16px',
                      fontSize: '13px',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--ws-ink)' : 'var(--ws-rule)',
                      background: isActive ? 'var(--ws-ink)' : 'var(--ws-surface)',
                      color: isActive ? '#ffffff' : 'var(--ws-ink-soft)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {comp.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Opportunity Cards */}
          <div className="ws-opportunities-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {filteredJobs.map((job, index) => {
              const isSelected =
                (selectedJob?.job_id && selectedJob.job_id === job.job_id) ||
                (selectedJob?.role_title === job.role_title && selectedJob?.company_name === job.company_name);
              const isFixtureJob = Boolean(job.is_fixture || job.isFixture || isDemoMode);
              const primaryReason = job.reasons?.[0] || 'Matches target technology stack';

              return (
                <article
                  key={`${job.company_id || job.company_name}-${job.role_title}-${index}`}
                  className={`ws-card ws-opportunity-card ${isSelected ? 'selected' : ''}`}
                  data-testid={`opportunity-card-${index}`}
                  style={{
                    background: isSelected ? '#f8faf7' : 'var(--ws-surface)',
                    border: isSelected ? '2px solid var(--ws-ink)' : '1px solid var(--ws-rule)',
                    borderRadius: '8px',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '12px', fontFamily: 'var(--ws-font-mono)', fontWeight: 600, color: 'var(--ws-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {job.company_name}
                        </span>
                        {isFixtureJob && (
                          <span
                            className="ws-badge ws-badge-demo"
                            data-testid="demo-sample-badge"
                            style={{
                              background: '#f4fce3',
                              color: '#3f4b08',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: '3px',
                              border: '1px solid #d9f99d',
                            }}
                          >
                            Demo sample
                          </span>
                        )}
                      </div>
                      <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ws-ink)', margin: 0 }}>
                        {job.role_title}
                      </h2>
                    </div>
                    {job.location && (
                      <span style={{ fontSize: '12px', color: 'var(--ws-muted)', background: '#f1f5f0', padding: '3px 8px', borderRadius: '4px' }}>
                        📍 {job.location}
                      </span>
                    )}
                  </div>

                  {isFixtureJob && (
                    <div
                      className="ws-demo-notice-text"
                      style={{ fontSize: '12px', color: '#854d0e', fontStyle: 'italic' }}
                    >
                      {job.fixture_label || job.fixtureLabel || EXACT_DEMO_FIXTURE_LABEL}
                    </div>
                  )}

                  <div style={{ fontSize: '14px', color: 'var(--ws-ink-soft)', lineHeight: 1.4 }}>
                    <span style={{ color: '#16a34a', marginRight: '6px', fontWeight: 'bold' }}>✓</span>
                    {primaryReason}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--ws-rule-subtle)', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ fontSize: '13px' }}>
                      {isFixtureJob ? (
                        <a
                          href={job.career_url || job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--ws-muted)', textDecoration: 'underline' }}
                        >
                          Company careers page ↗
                        </a>
                      ) : (
                        <a
                          href={job.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--ws-ink)', textDecoration: 'underline' }}
                        >
                          Source listing ↗
                        </a>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleChoose(job)}
                      disabled={isSelecting}
                      className="ws-button-primary"
                      data-testid={`choose-opportunity-btn-${index}`}
                      style={{
                        padding: '6px 14px',
                        fontSize: '13px',
                      }}
                    >
                      {isSelected ? '✓ Selected' : 'Choose this opportunity'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Selected Opportunity Confirmation Box */}
          {selectedJob && (
            <div
              className="ws-card ws-selection-confirmation"
              data-testid="selection-confirmation-panel"
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '16px 20px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginBottom: '2px' }}>
                  Opportunity Selected: {selectedJob.role_title} ({selectedJob.company_name})
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#14532d' }}>
                  Next, choose an open-source repository from {selectedCompanyName}.
                </div>
              </div>

              {onProceedToRepositories && (
                <button
                  type="button"
                  onClick={() => onProceedToRepositories(selectedJob.company_id || selectedCompanyName)}
                  className="ws-button-primary"
                  data-testid="continue-to-repos-btn"
                  style={{
                    background: '#15803d',
                    color: '#ffffff',
                    padding: '8px 18px',
                    fontSize: '14px',
                  }}
                >
                  Continue to repositories →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
