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
    expect(screen.getByText('What stack are you exploring?')).toBeInTheDocument();
    expect(screen.getAllByText('Discover')[0]).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Find opportunities' })
    ).toBeInTheDocument();
  });

  it('creates live session and transitions to confirmed state with Start research action', async () => {
    const mockSession = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: null,
      stage: 'created',
      data_mode: 'live',
      dataMode: 'live',
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
      expect(screen.getByText('Ready to search for opportunities?')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Search opportunities' })).toBeInTheDocument();
    expect(sessionStorage.getItem('web-slinger-session-id')).toBe(mockSession.session_id);
  });

  it('in DEMO_MODE=true, new session renders Opportunities immediately and never displays live degraded card', async () => {
    const mockDemoSession = {
      session_id: 'demo-123e4567-e89b-12d3-a456-426614174000',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: null,
      stage: 'researching',
      data_mode: 'demo',
      dataMode: 'demo',
      research_results: [
        {
          company_id: 'cloudflare',
          company_name: 'Cloudflare',
          role_title: 'Senior TypeScript Systems Engineer',
          is_fixture: true,
          fixture_label: 'Demo sample — not a live job listing',
          score: 95,
          reasons: ['Matches stack'],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDemoSession,
    } as Response);

    render(<App />);

    const submitBtn = screen.getByRole('button', {
      name: 'Find opportunities',
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Pick a company to explore.' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/Live company research is still processing/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Demo sample — not a live job listing').length).toBeGreaterThan(0);
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

    expect(screen.getAllByText('Discover')[0]).toBeInTheDocument();
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
        message: 'Research completed with live results',
        is_fixture: false,
      },
      message: 'Research completed with live results',
      research_results: [
        {
          company_id: 'cloudflare',
          company_name: 'Cloudflare',
          role_title: 'Senior Frontend Engineer',
          location: 'Remote - US',
          source_url: 'https://www.cloudflare.com/careers/jobs/senior-frontend',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          job_id: 'live-cf-01',
          score: 95,
          reasons: ['Matches target stack (TypeScript, React)'],
        },
      ],
    };

    const mockIssuesResponse = {
      session_id: sessionId,
      owner: 'cloudflare',
      repo: 'workers-sdk',
      status: 'completed',
      message: 'Found issues',
      issues: [
        {
          id: 901,
          number: 10,
          title: 'Upgrade turbopack loader module',
          body: 'Detailed description',
          html_url: 'https://github.com/cloudflare/workers-sdk/issues/10',
          state: 'open',
          labels: ['good-first-issue'],
          assignees: [],
          author: 'dev',
          comments_count: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_url: 'https://github.com/cloudflare/workers-sdk/issues/10',
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
      if (url.includes('/select-opportunity')) {
        return {
          ok: true,
          json: async () => ({ session_id: sessionId, stage: 'company_selected' }),
        } as Response;
      }
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

    // OpportunitiesCanvas heading
    await waitFor(() => {
      expect(screen.getByText('Choose an engineering opportunity')).toBeInTheDocument();
    });

    expect(screen.getByText('Cloudflare')).toBeInTheDocument();
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Source listing ↗')).toHaveAttribute(
      'href',
      'https://www.cloudflare.com/careers/jobs/senior-frontend'
    );

    // Select the opportunity card
    const chooseBtn = screen.getByRole('button', { name: 'Choose this opportunity' });
    fireEvent.click(chooseBtn);

    // After selecting, the confirmation panel appears with "Continue to repositories →"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Continue to repositories/i })).toBeInTheDocument();
    });

    // Click "Continue to repositories →" to navigate to issues view
    const continueBtn = screen.getByRole('button', { name: /Continue to repositories/i });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText(/Choose a verified repository from Cloudflare/i)).toBeInTheDocument();
    });

    // Choose the verified repository
    const chooseRepoBtn = screen.getByTestId('choose-repo-btn-0');
    fireEvent.click(chooseRepoBtn);

    await waitFor(() => {
      expect(screen.getByText('Which issue would you like to investigate?')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Choose')[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Upgrade turbopack loader module/i)[0]).toBeInTheDocument();

    // Click "Understand this issue" to transition to Context Brief view
    const understandBtn = screen.getByRole('button', { name: 'Understand this issue' });
    fireEvent.click(understandBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Understand')[0]).toBeInTheDocument();
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
        message: 'Public collection timed out',
        is_fixture: false,
      },
      message: 'Public collection timed out',
      research_results: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatusDegraded,
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(/Live company research is still processing\. Your session is saved\./i)
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Check existing research/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Start over/i }).length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getByText('Ready to search for opportunities?')).toBeInTheDocument();
    });

    const newSessionBtn = screen.getByRole('button', { name: 'New session' });
    act(() => {
      fireEvent.click(newSessionBtn);
    });

    expect(screen.getByText('What stack are you exploring?')).toBeInTheDocument();
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

  it('restores verify stage and renders simplified VerifyCanvas with stage rail at Verify', async () => {
    const sessionId = 'verify-session-id-5678';
    sessionStorage.setItem('web-slinger-session-id', sessionId);
    sessionStorage.setItem('web-slinger-view', 'verify');
    sessionStorage.setItem(
      'web-slinger-selected-issue',
      JSON.stringify({
        id: 42,
        number: 42,
        title: 'Fix curriculum markdown parsing',
        html_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/42',
      })
    );

    const mockStatus = {
      session_id: sessionId,
      stage: 'issue_selected',
      stack: ['TypeScript'],
      normalized_stack: ['typescript'],
      goal: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/verification-records')) {
        return {
          ok: true,
          json: async () => ({
            session_id: sessionId,
            issue_number: 42,
            records: [],
            updated_at: new Date().toISOString(),
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => mockStatus,
      } as Response;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Check your work before you share it.')).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        'Web-Slinger did not run these checks. Record only what you saw in your own workspace.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Selected practice repository')).toBeInTheDocument();
    expect(screen.getByText('#42 Fix curriculum markdown parsing')).toBeInTheDocument();
  });
});
