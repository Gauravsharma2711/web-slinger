import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextBriefCanvas } from '../src/components/ContextBriefCanvas.js';
import * as api from '../src/api/sessions.js';
import {
  SessionDocument,
  NormalizedIssue,
  ContextBriefResponse,
} from '@web-slinger/shared';

describe('ContextBriefCanvas Component & Reading Flow', () => {
  const mockSession: SessionDocument = {
    session_id: 'session-brief-test-1234',
    stack: ['TypeScript', 'React'],
    normalized_stack: ['typescript', 'react'],
    goal: null,
    stage: 'issue_selected',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    current_job_id: 'job-1',
    snapshot_id: 'snap-1',
    health: {
      status: 'healthy',
      message: 'Active',
      timestamp: new Date().toISOString(),
    },
  };

  const mockIssue: NormalizedIssue = {
    id: 69622,
    number: 69622,
    title: 'fs lesson incorrectly states that every method has a synchronous version',
    body: 'In the Node.js core modules lesson...',
    state: 'open',
    html_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
    author: 'contributor1',
    assignees: [],
    labels: ['help wanted', 'scope: curriculum'],
    comments_count: 2,
    created_at: '2026-08-20T10:00:00Z',
    updated_at: '2026-08-21T12:00:00Z',
    source_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
    retrieved_at: '2026-08-21T12:00:00Z',
    tier: 'A',
    score: 95,
    reasons: ['Configured onboarding label', 'High context'],
    is_fixture: false,
    repository_relationship: 'selected_practice_repository',
    repository_relationship_label: 'Selected practice repository',
  };

  const mockValidBrief: ContextBriefResponse = {
    session_id: 'session-brief-test-1234',
    issue_number: 69622,
    status: 'completed',
    brief: {
      summary: 'Issue #69622 reports an inaccuracy in the Node.js curriculum regarding fs synchronous methods.',
      likelyContributionShape: 'Curriculum markdown lesson file located in /curriculum directory.',
      whatToReadFirst: [
        {
          instruction: 'Read issue report and proposed phrasing change',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        },
        {
          instruction: 'Read repository contributing guidelines',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/README.md',
        },
      ],
      unknownsToVerify: [
        'The exact markdown file path for the affected lesson.',
        'Preferred curriculum terminology for async vs sync APIs.',
      ],
      suggestedFirstQuestion: 'Would updating the lesson phrasing to "Many methods in the fs module" be preferred?',
      sourceCitations: [
        {
          claim: 'The lesson claims every method has a synchronous form.',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        },
        {
          claim: 'Curriculum files are organized under /curriculum.',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/README.md',
        },
      ],
    },
    sources: [
      {
        title: 'Issue #69622',
        url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        retrievedAt: new Date().toISOString(),
      },
      {
        title: 'README.md',
        url: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/README.md',
        retrievedAt: new Date().toISOString(),
      },
    ],
    model_id: 'gemini-3.7-flash',
    generated_at: new Date().toISOString(),
    validation_errors: [],
    is_fixture: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders generating state when brief is being retrieved or generated', () => {
    vi.spyOn(api, 'getContextBrief').mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, 'generateContextBrief').mockReturnValue(new Promise(() => {}));

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onBackToIssues={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Generating evidence-grounded brief...')).toBeInTheDocument();
  });

  it('renders completed valid brief in exact required section order with exact mandatory notice and actions', async () => {
    vi.spyOn(api, 'getContextBrief').mockResolvedValue(mockValidBrief);

    const onBackMock = vi.fn();
    const onResetMock = vi.fn();
    const onOpenWorkbenchMock = vi.fn();

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onOpenWorkbench={onOpenWorkbenchMock}
        onBackToIssues={onBackMock}
        onReset={onResetMock}
      />
    );

    // Dominant question
    await waitFor(() => {
      expect(screen.getByText('What is this issue about and what should you verify?')).toBeInTheDocument();
    });

    // 2. Issue Title & Number
    expect(screen.getByText('#69622')).toBeInTheDocument();
    expect(screen.getAllByText(/fs lesson incorrectly states that every method has a synchronous version/i)[0]).toBeInTheDocument();

    // 3. Source GitHub link
    const ghLink = screen.getByRole('link', { name: /View issue #69622 on GitHub/i });
    expect(ghLink).toHaveAttribute('href', mockIssue.html_url);

    // 4. Summary
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText(mockValidBrief.brief!.summary)).toBeInTheDocument();

    // 5. Likely Contribution Shape
    expect(screen.getByRole('heading', { name: 'Likely Contribution Shape' })).toBeInTheDocument();
    expect(screen.getByText(mockValidBrief.brief!.likelyContributionShape)).toBeInTheDocument();

    // 6. What to Read First
    expect(screen.getByRole('heading', { name: 'What to Read First' })).toBeInTheDocument();
    expect(screen.getByText('Read issue report and proposed phrasing change')).toBeInTheDocument();

    // 7. Unknowns You Must Verify
    expect(screen.getByRole('heading', { name: 'Unknowns You Must Verify' })).toBeInTheDocument();
    expect(screen.getByText('The exact markdown file path for the affected lesson.')).toBeInTheDocument();

    // 8. Suggested First Question
    expect(screen.getByRole('heading', { name: 'Suggested First Question' })).toBeInTheDocument();
    expect(screen.getByText(mockValidBrief.brief!.suggestedFirstQuestion)).toBeInTheDocument();

    // 9. Source Citations
    expect(screen.getByRole('heading', { name: 'Source Citations' })).toBeInTheDocument();
    expect(screen.getAllByText('The lesson claims every method has a synchronous form.')[0]).toBeInTheDocument();
    expect(screen.getByText('[S1]')).toBeInTheDocument();

    // Requirement 3: Exact notice
    expect(
      screen.getByText(
        'This brief is a starting point, not a solution. Read the linked issue and repository guidance before changing code.'
      )
    ).toBeInTheDocument();

    // Requirement 4: Primary & Secondary actions
    const primaryBtn = screen.getByRole('button', { name: /I have read this — open workbench/i });
    expect(primaryBtn).toBeInTheDocument();

    const secondaryLink = screen.getByRole('link', { name: 'Open on GitHub' });
    expect(secondaryLink).toHaveAttribute('href', mockIssue.html_url);

    // Verify forbidden buttons DO NOT exist
    expect(screen.queryByRole('button', { name: /^Fix$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Push$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Submit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create pull request/i })).not.toBeInTheDocument();

    // Clicking primary button opens workbench
    fireEvent.click(primaryBtn);
    expect(onOpenWorkbenchMock).toHaveBeenCalled();
  });

  it('renders needs_review state with validation warnings and retry button', async () => {
    const mockNeedsReview: ContextBriefResponse = {
      ...mockValidBrief,
      status: 'needs_review',
      validation_errors: [
        'Cited URL outside allowed source pack: https://malicious.com',
        'Contains prohibited automated command.',
      ],
      brief: null,
    };

    vi.spyOn(api, 'getContextBrief').mockResolvedValue(mockNeedsReview);

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onBackToIssues={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Brief needs manual review.')).toBeInTheDocument();
    });

    expect(screen.getByText('Cited URL outside allowed source pack: https://malicious.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regenerate brief/i })).toBeInTheDocument();
  });

  it('renders Vertex AI unavailable state on 500 error with retry button', async () => {
    const error: api.ContextBriefApiError = new Error('Vertex AI model upstream unavailable');
    error.status = 502;
    vi.spyOn(api, 'getContextBrief').mockRejectedValue(error);
    vi.spyOn(api, 'generateContextBrief').mockRejectedValue(error);

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onBackToIssues={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Brief generation paused.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument();
  });

  it('renders GitHub source unavailable on 404 error with retry button', async () => {
    const error: api.ContextBriefApiError = new Error('Repository or issue not found');
    error.status = 404;
    vi.spyOn(api, 'getContextBrief').mockRejectedValue(error);
    vi.spyOn(api, 'generateContextBrief').mockRejectedValue(error);

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onBackToIssues={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Issue sources unavailable.')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: /Back to candidate issues/i })[0]).toBeInTheDocument();
  });

  it('renders DEMO_MODE fixture badge in details when is_fixture is true', async () => {
    const mockFixtureBrief: ContextBriefResponse = {
      ...mockValidBrief,
      is_fixture: true,
    };

    vi.spyOn(api, 'getContextBrief').mockResolvedValue(mockFixtureBrief);

    render(
      <ContextBriefCanvas
        session={mockSession}
        issue={mockIssue}
        onBackToIssues={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Mode: Sample demonstration fixture')).toBeInTheDocument();
    });
  });
});
