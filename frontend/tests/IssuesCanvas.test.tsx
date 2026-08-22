/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IssuesCanvas } from '../src/components/IssuesCanvas.js';
import { SessionDocument } from '@web-slinger/shared';

describe('IssuesCanvas Component & Candidate Issue Triage Flow', () => {
  const mockSession: SessionDocument = {
    session_id: '123e4567-e89b-12d3-a456-426614174000',
    stack: ['TypeScript', 'React'],
    normalized_stack: ['typescript', 'react'],
    goal: null,
    stage: 'researching',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays loading state with accessible announcement on initial render', async () => {
    // Delay fetch to assert loading
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  session_id: mockSession.session_id,
                  owner: 'facebook',
                  repo: 'react',
                  status: 'completed',
                  message: 'Success',
                  issues: [],
                  total_count: 0,
                  cached: false,
                  is_fixture: false,
                }),
              } as Response),
            100
          )
        )
    );

    render(
      <IssuesCanvas
        session={mockSession}
        onBackToOpportunities={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText('Discovering candidate issues.')).toBeInTheDocument();
    expect(
      screen.getByText(/Scanning target repository for open candidate issues/i)
    ).toBeInTheDocument();
  });

  it('renders triaged candidate cards with Tier badges, reasons, labels, and actions', async () => {
    const mockResponse = {
      session_id: mockSession.session_id,
      owner: 'facebook',
      repo: 'react',
      status: 'completed',
      message: 'Found 2 issues',
      issues: [
        {
          id: 101,
          number: 101,
          title: 'Fix hydration mismatch with suspense boundary',
          body: 'Detailed description of the suspense hydration mismatch problem.',
          html_url: 'https://github.com/facebook/react/issues/101',
          state: 'open',
          labels: ['good first issue', 'bug'],
          assignees: [],
          author: 'alice',
          comments_count: 3,
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-02T10:00:00Z',
          source_url: 'https://github.com/facebook/react/issues/101',
          retrieved_at: '2026-08-22T10:00:00Z',
          tier: 'A',
          score: 90,
          reasons: [
            'Matched onboarding label: "good first issue" (intended for external contributors).',
            'No active assignees; open for immediate contributor claim.',
            'Comprehensive issue description with detailed context (67 characters).',
          ],
          is_fixture: false,
        },
        {
          id: 102,
          number: 102,
          title: 'Refactor internal compiler pipeline',
          body: 'Complex architecture refactor.',
          html_url: 'https://github.com/facebook/react/issues/102',
          state: 'open',
          labels: ['compiler'],
          assignees: ['bob'],
          author: 'charlie',
          comments_count: 8,
          created_at: '2026-08-01T11:00:00Z',
          updated_at: '2026-08-02T11:00:00Z',
          source_url: 'https://github.com/facebook/react/issues/102',
          retrieved_at: '2026-08-22T10:00:00Z',
          tier: 'B',
          score: 45,
          reasons: [
            "No standard onboarding label (e.g. 'good first issue' or 'help wanted') found.",
            'Assigned to contributor(s): bob.',
          ],
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

    render(
      <IssuesCanvas
        session={mockSession}
        onBackToOpportunities={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Candidate issues.')).toBeInTheDocument();
    });

    // Check Tier A badge & title
    expect(screen.getByText(/TIER A • Onboarding Scope/i)).toBeInTheDocument();
    expect(screen.getByText(/Fix hydration mismatch with suspense boundary/i)).toBeInTheDocument();
    expect(screen.getByText(/#101/)).toBeInTheDocument();

    // Check Tier B badge & title
    expect(screen.getByText(/TIER B • Standard Scope/i)).toBeInTheDocument();
    expect(screen.getByText(/Refactor internal compiler pipeline/i)).toBeInTheDocument();

    // Check deterministic reasons
    expect(
      screen.getByText(/Matched onboarding label: "good first issue"/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No standard onboarding label/i)
    ).toBeInTheDocument();

    // Check external View on GitHub link
    const gitHubLinks = screen.getAllByText('View on GitHub ↗');
    expect(gitHubLinks).toHaveLength(2);
    expect(gitHubLinks[0].closest('a')).toHaveAttribute(
      'href',
      'https://github.com/facebook/react/issues/101'
    );

    // Check primary action
    const understandButtons = screen.getAllByRole('button', {
      name: 'Understand this issue',
    });
    expect(understandButtons).toHaveLength(2);

    // Click "Understand this issue" -> verify feedback notice and callback
    fireEvent.click(understandButtons[0]);
    expect(
      screen.getByText(/Issue #101 selected\./i)
    ).toBeInTheDocument();
  });

  it('renders GitHub rate limit state (403) with retry action', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('GitHub rate limit reached.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Retry discovery' })).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText('Repository unavailable.')).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: 'Back to opportunities' });
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalled();
  });

  it('renders empty state when zero candidate issues returned', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: mockSession.session_id,
        owner: 'test-owner',
        repo: 'empty-repo',
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

    await waitFor(() => {
      expect(screen.getByText('No candidate issues found.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Refresh issues' })).toBeInTheDocument();
  });

  it('visibly labels DEMO_MODE fixtures with Demo fixture banner and badges', async () => {
    const mockFixtureResponse = {
      session_id: mockSession.session_id,
      owner: 'facebook',
      repo: 'react',
      status: 'completed',
      message: 'Demo mode fixture issues loaded',
      issues: [
        {
          id: 501,
          number: 42,
          title: '[DEMO FIXTURE] Refactor state manager hook',
          body: 'Fixture description',
          html_url: 'https://github.com/facebook/react/issues/42',
          state: 'open',
          labels: ['demo-fixture', 'help wanted'],
          assignees: [],
          author: 'demo-user',
          comments_count: 1,
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-02T10:00:00Z',
          source_url: 'https://github.com/facebook/react/issues/42',
          retrieved_at: '2026-08-22T10:00:00Z',
          tier: 'A',
          score: 95,
          reasons: ['Matched onboarding label: "help wanted"'],
          is_fixture: true,
        },
      ],
      total_count: 1,
      cached: false,
      is_fixture: true,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockFixtureResponse,
    } as Response);

    render(
      <IssuesCanvas
        session={mockSession}
        onBackToOpportunities={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Simulated candidate issues loaded for demonstration/i)).toBeInTheDocument();
    });

    const badges = screen.getAllByText('Demo fixture');
    expect(badges.length).toBeGreaterThanOrEqual(2); // Banner badge + card badge
  });
});
