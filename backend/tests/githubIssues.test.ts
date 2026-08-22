import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  InMemorySessionRepository,
} from '../src/repositories/sessionRepository.js';
import {
  InMemoryJobRepository,
} from '../src/repositories/jobRepository.js';
import {
  GitHubIssuesClient,
} from '../src/services/githubIssuesClient.js';
import {
  computeSha256Fingerprint,
} from '../src/config.js';
import { SessionDocument } from '@web-slinger/shared';

describe('GitHub Issue Discovery Service & Route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GitHubIssuesClient Unit Tests', () => {
    it('excludes returned objects containing pull_request', async () => {
      const mockRawItems = [
        {
          id: 101,
          number: 1,
          title: 'Real Issue about memory leak',
          body: 'Here is the description of the memory leak in full detail.',
          html_url: 'https://github.com/facebook/react/issues/1',
          state: 'open',
          labels: [{ name: 'good first issue' }],
          assignees: [],
          user: { login: 'bob' },
          comments: 3,
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-02T10:00:00Z',
        },
        {
          id: 102,
          number: 2,
          title: 'Pull Request fixing memory leak',
          body: 'Fixes #1',
          html_url: 'https://github.com/facebook/react/pull/2',
          state: 'open',
          pull_request: {
            url: 'https://api.github.com/repos/facebook/react/pulls/2',
          },
          labels: [{ name: 'bug' }],
          assignees: [],
          user: { login: 'charlie' },
          comments: 1,
          created_at: '2026-08-02T11:00:00Z',
          updated_at: '2026-08-02T11:00:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-remaining': '4999',
          'x-ratelimit-reset': '1700000000',
        }),
        json: async () => mockRawItems,
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        baseUrl: 'https://api.github.com',
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('facebook', 'react');

      expect(result.status).toBe('completed');
      expect(result.totalCount).toBe(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].id).toBe(101);
      expect(result.issues[0].number).toBe(1);
      expect(result.issues[0].title).toBe('Real Issue about memory leak');
      expect(result.issues[0].tier).toBe('A');
      expect(result.issues[0].score).toBeGreaterThan(0);
      expect(result.issues[0].reasons.length).toBeGreaterThan(0);
    });

    it('gracefully normalizes nullable issue body and triages as Tier B with explanation', async () => {
      const mockRawItems = [
        {
          id: 201,
          number: 55,
          title: 'Issue without description body',
          body: null,
          html_url: 'https://github.com/facebook/react/issues/55',
          state: 'open',
          labels: [{ name: 'good first issue' }],
          assignees: [],
          user: { login: 'dave' },
          comments: 0,
          created_at: '2026-08-05T12:00:00Z',
          updated_at: '2026-08-05T12:00:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-remaining': '4998',
        }),
        json: async () => mockRawItems,
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('facebook', 'react');
      expect(result.status).toBe('completed');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].body).toBeNull();
      expect(result.issues[0].tier).toBe('B');
      expect(result.issues[0].reasons.some((r) => r.includes('Thin or missing issue description'))).toBe(true);
    });

    it('sorts returned issues deterministically by score descending', async () => {
      const mockRawItems = [
        {
          id: 401,
          number: 1,
          title: 'Complex bug with no onboarding label',
          body: 'Detailed reproduction of complex bug',
          html_url: 'https://github.com/facebook/react/issues/1',
          state: 'open',
          labels: [{ name: 'bug' }],
          assignees: ['alice'],
          user: { login: 'bob' },
          comments: 2,
          created_at: '2026-08-01T10:00:00Z',
          updated_at: '2026-08-02T10:00:00Z',
        },
        {
          id: 402,
          number: 2,
          title: 'Starter issue for beginners to fix typo',
          body: 'Clear guidance and instructions for newcomer to fix typo.',
          html_url: 'https://github.com/facebook/react/issues/2',
          state: 'open',
          labels: [{ name: 'good-first-issue' }],
          assignees: [],
          user: { login: 'charlie' },
          comments: 1,
          created_at: '2026-08-02T11:00:00Z',
          updated_at: '2026-08-02T11:00:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-remaining': '4999',
        }),
        json: async () => mockRawItems,
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        baseUrl: 'https://api.github.com',
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('facebook', 'react');
      expect(result.issues).toHaveLength(2);
      // The Tier A issue (#2) should be sorted first with highest score
      expect(result.issues[0].number).toBe(2);
      expect(result.issues[0].tier).toBe('A');
      expect(result.issues[1].number).toBe(1);
      expect(result.issues[1].tier).toBe('B');
      expect(result.issues[0].score).toBeGreaterThan(result.issues[1].score);
    });

    it('does not send Authorization header when token is empty', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      await client.fetchIssues('facebook', 'react');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/facebook/react/issues'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
    });

    it('sends Bearer Authorization header when token is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: 'ghp_secret_token_123',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: true,
          tokenFingerprint: computeSha256Fingerprint('ghp_secret_token_123'),
        },
      });

      await client.fetchIssues('facebook', 'react');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/facebook/react/issues'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_secret_token_123',
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          }),
        })
      );
    });

    it('maps 403 Rate Limit responses honestly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1700003600',
        }),
        text: async () => 'API rate limit exceeded for 127.0.0.1',
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('facebook', 'react');
      expect(result.status).toBe('rate_limited');
      expect(result.message).toContain('rate limit reached');
      expect(result.rateLimitRemaining).toBe(0);
      expect(result.rateLimitReset).toBe(1700003600);
      expect(result.issues).toHaveLength(0);
    });

    it('maps 404 Repository Not Found responses honestly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: async () => '{"message":"Not Found"}',
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'nonexistent-org',
          repo: 'unknown-repo',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('nonexistent-org', 'unknown-repo');
      expect(result.status).toBe('not_found');
      expect(result.message).toContain('was not found on GitHub');
    });

    it('returns visibly labelled fixtures with scores and reasons when DEMO_MODE=true without calling fetch', async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: true,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const result = await client.fetchIssues('facebook', 'react');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.status).toBe('completed');
      expect(result.isFixture).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].is_fixture).toBe(true);
      expect(result.issues[0].title).toContain('[DEMO FIXTURE]');
      expect(result.issues[0].tier).toBe('A');
      expect(result.issues[0].score).toBeGreaterThan(0);
      expect(result.issues[0].reasons.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/sessions/:sessionId/issues Integration Tests', () => {
    let sessionRepo: InMemorySessionRepository;
    let jobRepo: InMemoryJobRepository;

    beforeEach(() => {
      sessionRepo = new InMemorySessionRepository();
      jobRepo = new InMemoryJobRepository();
    });

    it('fetches, normalizes, triages, and persists issues on first call and returns cached results on second call', async () => {
      const mockRawItems = [
        {
          id: 301,
          number: 10,
          title: 'Investigate SSR hydration mismatch',
          body: 'Detailed repro inside repo repository with steps to reproduce and stack trace.',
          html_url: 'https://github.com/facebook/react/issues/10',
          state: 'open',
          labels: [{ name: 'ssr' }, { name: 'bug' }],
          assignees: [],
          user: { login: 'engineer1' },
          comments: 4,
          created_at: '2026-08-10T10:00:00Z',
          updated_at: '2026-08-10T10:00:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '60' }),
        json: async () => mockRawItems,
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new GitHubIssuesClient({
        demoMode: false,
        config: {
          owner: 'facebook',
          repo: 'react',
          token: '',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: false,
          tokenFingerprint: 'none',
        },
      });

      const app = createApp(sessionRepo, jobRepo, undefined, client);

      const session: SessionDocument = {
        session_id: '123e4567-e89b-12d3-a456-426614174000',
        stack: ['React', 'TypeScript'],
        normalized_stack: ['react', 'typescript'],
        goal: null,
        stage: 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await sessionRepo.createSession(session);

      // First Request: triggers GitHub API fetch
      const res1 = await request(app).get(`/api/sessions/${session.session_id}/issues`);
      expect(res1.status).toBe(200);
      expect(res1.body.cached).toBe(false);
      expect(res1.body.total_count).toBe(1);
      expect(res1.body.issues[0].title).toBe('Investigate SSR hydration mismatch');
      expect(res1.body.issues[0].tier).toBe('B');
      expect(res1.body.issues[0].score).toBeGreaterThan(0);
      expect(res1.body.issues[0].reasons.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify issues were persisted to session
      const stored = await sessionRepo.getSession(session.session_id);
      expect(stored?.discovered_issues).toBeDefined();
      expect(stored?.discovered_issues).toHaveLength(1);
      expect(stored?.discovered_issues?.[0].score).toBe(res1.body.issues[0].score);

      // Second Request: returns cached result without invoking GitHub API
      const res2 = await request(app).get(`/api/sessions/${session.session_id}/issues`);
      expect(res2.status).toBe(200);
      expect(res2.body.cached).toBe(true);
      expect(res2.body.status).toBe('cached');
      expect(res2.body.total_count).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Not called again!
    });

    it('rejects expired session with 404', async () => {
      const app = createApp(sessionRepo, jobRepo);

      const expiredSession: SessionDocument = {
        session_id: 'expired-12345-uuid',
        stack: ['Rust'],
        normalized_stack: ['rust'],
        goal: null,
        stage: 'created',
        created_at: new Date(Date.now() - 100000000).toISOString(),
        updated_at: new Date(Date.now() - 100000000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
      };
      await sessionRepo.createSession(expiredSession);

      const res = await request(app).get(`/api/sessions/${expiredSession.session_id}/issues`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session has expired');
    });

    it('returns 404 for nonexistent session ID', async () => {
      const app = createApp(sessionRepo, jobRepo);

      const res = await request(app).get('/api/sessions/nonexistent-session-id/issues');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });
});
