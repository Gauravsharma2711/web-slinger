/* Calm Proof Flow: one shared content rail, generous whitespace, no sidebar, evidence-first. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../src/App.js';

describe('App Decision Canvas Flow & Accessibility', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('renders initial EntryCanvas when no session exists in sessionStorage', () => {
    render(<App />);
    expect(screen.getByText('What stack are you targeting?')).toBeInTheDocument();
    expect(screen.getByText('ENTRY')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Find opportunities' })
    ).toBeInTheDocument();
  });

  it('creates session and transitions to confirmed state with Start research action', async () => {
    const mockSession = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: null,
      stage: 'created',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSession,
    } as Response);

    render(<App />);

    const submitBtn = screen.getByRole('button', {
      name: 'Find opportunities',
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Target stack confirmed.')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Start research' })).toBeInTheDocument();
    expect(sessionStorage.getItem('web-slinger-session-id')).toBe(mockSession.session_id);
  });

  it('triggers research and displays calm status sentence during polling', async () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    sessionStorage.setItem('web-slinger-session-id', sessionId);

    const mockStatusRunning = {
      session_id: sessionId,
      stage: 'researching',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ttl_seconds_remaining: 86400,
      is_expired: false,
      current_job: {
        job_id: 'job_123',
        type: 'research',
        status: 'running',
        message: 'Collecting live public job listings. This can take a few minutes.',
      },
      message: 'Collecting live public job listings. This can take a few minutes.',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatusRunning,
    } as Response);

    globalThis.fetch = mockFetch;

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(/Collecting live public job listings for TypeScript \+ React\./i)
      ).toBeInTheDocument();
    });

    expect(screen.getByText('RESEARCHING')).toBeInTheDocument();
  });

  it('displays short result preview with company, role, and source link when completed, and navigates to candidate issues', async () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    sessionStorage.setItem('web-slinger-session-id', sessionId);

    const mockStatusCompleted = {
      session_id: sessionId,
      stage: 'researching',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ttl_seconds_remaining: 86400,
      is_expired: false,
      current_job: {
        job_id: 'job_123',
        type: 'research',
        status: 'completed',
        message: 'Fixture research completed with demo results',
        is_fixture: true,
      },
      message: 'Fixture research completed with demo results',
      research_results: [
        {
          company_name: 'Vercel',
          role_title: 'Senior Frontend Engineer',
          location: 'Remote - US',
          source_url: 'https://vercel.com/careers/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
      ],
    };

    const mockIssuesResponse = {
      session_id: sessionId,
      owner: 'vercel',
      repo: 'next.js',
      status: 'completed',
      message: 'Found issues',
      issues: [
        {
          id: 901,
          number: 10,
          title: 'Upgrade turbopack loader module',
          body: 'Detailed description',
          html_url: 'https://github.com/vercel/next.js/issues/10',
          state: 'open',
          labels: ['good-first-issue'],
          assignees: [],
          author: 'dev',
          comments_count: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_url: 'https://github.com/vercel/next.js/issues/10',
          retrieved_at: new Date().toISOString(),
          tier: 'A',
          score: 90,
          reasons: ['Matched onboarding label: "good-first-issue"'],
          is_fixture: false,
        },
      ],
      total_count: 1,
      cached: false,
      is_fixture: false,
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/issues')) {
        return {
          ok: true,
          json: async () => mockIssuesResponse,
        } as Response;
      }
      return {
        ok: true,
        json: async () => mockStatusCompleted,
      } as Response;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Opportunities found.')).toBeInTheDocument();
    });

    expect(screen.getByText('Vercel')).toBeInTheDocument();
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('View Source ↗')).toHaveAttribute(
      'href',
      'https://vercel.com/careers/1'
    );
    expect(screen.getByText('RESEARCH COMPLETED')).toBeInTheDocument();

    // Click "Explore candidate issues"
    const exploreBtn = screen.getByRole('button', { name: 'Explore candidate issues' });
    fireEvent.click(exploreBtn);

    await waitFor(() => {
      expect(screen.getByText('Candidate issues.')).toBeInTheDocument();
    });

    expect(screen.getByText('CANDIDATE ISSUES')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade turbopack loader module/i)).toBeInTheDocument();

    // Click "Understand this issue" to transition to Context Brief view
    const understandBtn = screen.getByRole('button', { name: 'Understand this issue' });
    fireEvent.click(understandBtn);

    await waitFor(() => {
      expect(screen.getByText('CONTEXT BRIEF')).toBeInTheDocument();
    });
  });

  it('displays degraded state with retry action and clear fixture label when fixture data used', async () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    sessionStorage.setItem('web-slinger-session-id', sessionId);

    const mockStatusDegraded = {
      session_id: sessionId,
      stage: 'researching',
      stack: ['Node.js'],
      normalized_stack: ['node.js'],
      goal: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ttl_seconds_remaining: 86400,
      is_expired: false,
      current_job: {
        job_id: 'job_123',
        type: 'research',
        status: 'degraded',
        message: 'Demo mode fixture fallback active',
        is_fixture: true,
      },
      message: 'Demo mode fixture fallback active',
      research_results: [
        {
          company_name: '[DEMO FIXTURE] Node.js Core Labs',
          role_title: 'Senior Platform Engineer',
          location: 'Remote',
          source_url: 'https://demo.web-slinger.local/fixtures/jobs/1',
          collected_at: new Date().toISOString(),
          is_fixture: true,
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatusDegraded,
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Collector notice.')).toBeInTheDocument();
    });

    expect(screen.getByText('[DEMO FIXTURE]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry research' })).toBeInTheDocument();
    expect(screen.getByText('RESEARCH DEGRADED')).toBeInTheDocument();
  });

  it('resets session and clears sessionStorage', async () => {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    sessionStorage.setItem('web-slinger-session-id', sessionId);

    const mockStatus = {
      session_id: sessionId,
      stage: 'created',
      stack: ['TypeScript'],
      normalized_stack: ['typescript'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ttl_seconds_remaining: 86400,
      is_expired: false,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Target stack confirmed.')).toBeInTheDocument();
    });

    const newSessionBtn = screen.getByRole('button', { name: 'New session' });
    act(() => {
      fireEvent.click(newSessionBtn);
    });

    expect(screen.getByText('What stack are you targeting?')).toBeInTheDocument();
    expect(sessionStorage.getItem('web-slinger-session-id')).toBeNull();
  });

  it('restores session from sessionStorage and never displays a blank stack message', async () => {
    const sessionId = 'restore-session-id-1234';
    sessionStorage.setItem('web-slinger-session-id', sessionId);

    const mockStatus = {
      session_id: sessionId,
      stage: 'researching',
      stack: ['Rust', 'WebAssembly'],
      normalized_stack: ['rust', 'webassembly'],
      goal: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      ttl_seconds_remaining: 86400,
      is_expired: false,
      current_job: {
        job_id: 'job_rust',
        type: 'research',
        status: 'running',
        message: 'Collecting live public job listings. This can take a few minutes.',
      },
      message: 'Collecting live public job listings. This can take a few minutes.',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(/Collecting live public job listings for Rust \+ WebAssembly\./i)
      ).toBeInTheDocument();
    });

    // Ensure it NEVER shows "Finding public opportunities for ." or empty stack
    expect(screen.queryByText('Finding public opportunities for .')).not.toBeInTheDocument();
  });
});
