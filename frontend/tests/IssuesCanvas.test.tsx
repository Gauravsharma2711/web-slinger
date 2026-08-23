/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IssuesCanvas } from '../src/components/IssuesCanvas.js';
import { SessionDocument, NormalizedJobResult } from '@web-slinger/shared';

describe('IssuesCanvas Component & Selected Company Repository Flow', () => {
  const mockSession: SessionDocument = {
    session_id: '123e4567-e89b-12d3-a456-426614174000',
    stack: ['TypeScript', 'React'],
    normalized_stack: ['typescript', 'react'],
    goal: null,
    stage: 'company_selected',
    selected_company_id: 'cloudflare',
    selectedCompanyId: 'cloudflare',
    selected_job_id: 'cf-job-1',
    selectedJobId: 'cf-job-1',
    selected_job: {
      job_id: 'cf-job-1',
      company_id: 'cloudflare',
      company_name: 'Cloudflare',
      role_title: 'Senior TypeScript Systems Engineer',
      source_url: 'https://www.cloudflare.com/careers/jobs/',
      collected_at: new Date().toISOString(),
      score: 95,
      reasons: ['Matches target stack'],
      candidate_repositories: ['cloudflare/workers-sdk', 'cloudflare/cloudflare-docs'],
    } as unknown as NormalizedJobResult,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Breadcrumb and Repository Selection View', () => {
    it('displays breadcrumb: Company → chosen role → repository', () => {
      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const breadcrumb = screen.getByTestId('breadcrumb');
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent('Cloudflare');
      expect(breadcrumb).toHaveTextContent('Senior TypeScript Systems Engineer');
      expect(breadcrumb).toHaveTextContent('repository');
    });

    it('shows only repositories configured for Cloudflare with "Verified company repository" badge', () => {
      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Cloudflare candidate repos
      expect(screen.getByText('cloudflare/workers-sdk')).toBeInTheDocument();
      expect(screen.getByText('cloudflare/cloudflare-docs')).toBeInTheDocument();

      // Must visibly show "Verified company repository" badge for each
      const verifiedBadges = screen.getAllByText('Verified company repository');
      expect(verifiedBadges).toHaveLength(2);

      // Must NOT show other companies or unauthorized repos
      expect(screen.queryByText('getsentry/sentry')).not.toBeInTheDocument();
      expect(screen.queryByText('grafana/grafana')).not.toBeInTheDocument();
      expect(screen.queryByText('freeCodeCamp/freeCodeCamp')).not.toBeInTheDocument();
      expect(screen.queryByText('oracle/graal')).not.toBeInTheDocument();
    });

    it('the user chooses one repository before any issue request begins', () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Before user interaction, no fetch request for issues has occurred
      expect(fetchSpy).not.toHaveBeenCalled();

      // Repositories are displayed
      expect(screen.getByTestId('choose-repo-btn-0')).toBeInTheDocument();
    });
  });

  describe('2. Fetching and Displaying Candidate Issues', () => {
    it('clicking a repository initiates issue fetch and renders candidate issue cards', async () => {
      const mockResponse = {
        session_id: mockSession.session_id,
        owner: 'cloudflare',
        repo: 'workers-sdk',
        status: 'completed',
        message: 'Found 2 issues',
        issues: [
          {
            id: 101,
            number: 101,
            title: 'Fix hydration mismatch with suspense boundary in workers',
            body: 'Detailed description of the problem.',
            html_url: 'https://github.com/cloudflare/workers-sdk/issues/101',
            state: 'open',
            labels: ['good first issue', 'bug'],
            assignees: [],
            author: 'alice',
            comments_count: 3,
            created_at: '2026-08-01T10:00:00Z',
            updated_at: '2026-08-02T10:00:00Z',
            source_url: 'https://github.com/cloudflare/workers-sdk/issues/101',
            retrieved_at: '2026-08-22T10:00:00Z',
            tier: 'A',
            score: 90,
            reasons: [
              'Matched onboarding label: "good first issue" (intended for external contributors).',
              'No active assignees; open for immediate contributor claim.',
            ],
            is_fixture: false,
          },
          {
            id: 102,
            number: 102,
            title: 'Refactor internal pipeline in workers-sdk',
            body: 'Complex architecture refactor.',
            html_url: 'https://github.com/cloudflare/workers-sdk/issues/102',
            state: 'open',
            labels: ['compiler'],
            assignees: ['bob'],
            author: 'charlie',
            comments_count: 8,
            created_at: '2026-08-01T11:00:00Z',
            updated_at: '2026-08-02T11:00:00Z',
            source_url: 'https://github.com/cloudflare/workers-sdk/issues/102',
            retrieved_at: '2026-08-22T10:00:00Z',
            tier: 'B',
            score: 45,
            reasons: ['No standard onboarding label found.'],
            is_fixture: false,
          },
        ],
        total_count: 2,
        cached: false,
        is_fixture: false,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const onSelectIssue = vi.fn();

      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onSelectIssue={onSelectIssue}
          onReset={vi.fn()}
        />
      );

      // Choose cloudflare/workers-sdk
      const chooseRepoBtn = screen.getByTestId('choose-repo-btn-0');
      fireEvent.click(chooseRepoBtn);

      await waitFor(() => {
        expect(screen.getByText('Which issue would you like to investigate?')).toBeInTheDocument();
      });

      // Breadcrumb updated with repository
      expect(screen.getByTestId('breadcrumb')).toHaveTextContent('cloudflare/workers-sdk');

      // Check cards
      expect(screen.getByText('Strong first option')).toBeInTheDocument();
      expect(screen.getAllByText(/Fix hydration mismatch with suspense boundary in workers/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/#101/)[0]).toBeInTheDocument();

      // Check primary action
      const understandButtons = screen.getAllByRole('button', {
        name: 'Understand this issue',
      });
      expect(understandButtons).toHaveLength(2);

      // Click "Understand this issue" -> verify feedback notice and callback
      fireEvent.click(understandButtons[0]);
      expect(screen.getByText(/Issue #101 selected/i)).toBeInTheDocument();
      expect(onSelectIssue).toHaveBeenCalledWith(mockResponse.issues[0]);
    });
  });

  describe('3. No-issue state and preservation of selected company', () => {
    it('shows exact string: "No suitable issue found in this repository. Choose another company repository." and preserves selected company', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          session_id: mockSession.session_id,
          owner: 'cloudflare',
          repo: 'cloudflare-docs',
          status: 'completed',
          message: 'Discovered 0 issues',
          issues: [],
          total_count: 0,
          cached: false,
          is_fixture: false,
        }),
      } as Response);

      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Choose cloudflare/cloudflare-docs
      const chooseDocsBtn = screen.getByTestId('choose-repo-btn-1');
      fireEvent.click(chooseDocsBtn);

      await waitFor(() => {
        expect(
          screen.getByText('No suitable issue found in this repository. Choose another company repository.')
        ).toBeInTheDocument();
      });

      // Click "Choose another company repository"
      const chooseAnotherBtn = screen.getByTestId('choose-another-repo-btn');
      fireEvent.click(chooseAnotherBtn);

      // Verify it returns to the repository selection view for Cloudflare
      expect(screen.getByText('Choose a verified repository from Cloudflare')).toBeInTheDocument();
      expect(screen.getByText('cloudflare/workers-sdk')).toBeInTheDocument();
      expect(screen.getByText('cloudflare/cloudflare-docs')).toBeInTheDocument();
    });
  });

  describe('4. Error States & Rate Limit Handling', () => {
    it('renders GitHub rate limit state (403) with retry and choose another repository action', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'GitHub API rate limit reached. Please wait for reset.',
          status: 'rate_limited',
          message: 'GitHub API rate limit reached. Please wait for reset.',
        }),
      } as Response);

      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={vi.fn()}
          onReset={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('choose-repo-btn-0'));

      await waitFor(() => {
        expect(screen.getByText('GitHub rate limit reached.')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose another repository' })).toBeInTheDocument();
    });

    it('renders repository unavailable state (404) with back button', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Target repository not found on GitHub.',
          status: 'not_found',
          message: 'Target repository not found on GitHub.',
        }),
      } as Response);

      const onBackMock = vi.fn();
      render(
        <IssuesCanvas
          session={mockSession}
          onBackToOpportunities={onBackMock}
          onReset={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('choose-repo-btn-0'));

      await waitFor(() => {
        expect(screen.getByText('Repository unavailable.')).toBeInTheDocument();
      });

      const backBtns = screen.getAllByRole('button', { name: /Back to opportunities/i });
      fireEvent.click(backBtns[0]);
      expect(onBackMock).toHaveBeenCalled();
    });
  });
});
