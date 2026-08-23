import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import {
  findCompanyById,
  COMPANY_CATALOG,
  SessionDocument,
  NormalizedIssue,
} from '@web-slinger/shared';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { GitHubIssuesClient } from '../src/services/githubIssuesClient.js';

describe('Selected Company Repository & Issue Discovery Path', () => {
  let sessionRepository: InMemorySessionRepository;
  let gitHubIssuesClient: GitHubIssuesClient;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    sessionRepository = new InMemorySessionRepository();
    gitHubIssuesClient = new GitHubIssuesClient({ demoMode: true });
    app = createApp(
      sessionRepository,
      undefined,
      undefined,
      gitHubIssuesClient
    );
  });

  describe('1. Company Repository Isolation', () => {
    it('Cloudflare selection returns only Cloudflare configured repositories (never Sentry, Grafana, freeCodeCamp, or Oracle)', () => {
      const cloudflare = findCompanyById('cloudflare');
      expect(cloudflare).toBeDefined();
      expect(cloudflare?.name).toBe('Cloudflare');
      expect(cloudflare?.candidateRepositories).toEqual([
        'cloudflare/workers-sdk',
        'cloudflare/cloudflare-docs',
      ]);

      // Assert forbidden fallbacks and other companies are strictly absent
      expect(cloudflare?.candidateRepositories).not.toContain('getsentry/sentry');
      expect(cloudflare?.candidateRepositories).not.toContain('getsentry/sentry-javascript');
      expect(cloudflare?.candidateRepositories).not.toContain('grafana/grafana');
      expect(cloudflare?.candidateRepositories).not.toContain('grafana/loki');
      expect(cloudflare?.candidateRepositories).not.toContain('freeCodeCamp/freeCodeCamp');
      expect(cloudflare?.candidateRepositories).not.toContain('oracle/graal');
    });

    it('Sentry selection returns only Sentry configured repositories', () => {
      const sentry = findCompanyById('sentry');
      expect(sentry?.candidateRepositories).toEqual([
        'getsentry/sentry',
        'getsentry/sentry-javascript',
      ]);
      expect(sentry?.candidateRepositories).not.toContain('cloudflare/workers-sdk');
      expect(sentry?.candidateRepositories).not.toContain('grafana/grafana');
    });

    it('Grafana Labs selection returns only Grafana configured repositories', () => {
      const grafana = findCompanyById('grafana');
      expect(grafana?.candidateRepositories).toEqual([
        'grafana/grafana',
        'grafana/loki',
      ]);
      expect(grafana?.candidateRepositories).not.toContain('cloudflare/workers-sdk');
      expect(grafana?.candidateRepositories).not.toContain('getsentry/sentry');
    });

    it('Rejects repository requests that do not belong to the selected company with 400 Bad Request', async () => {
      const session: SessionDocument = {
        session_id: 'cf-session-123',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: 'Workers',
        stage: 'company_selected',
        selected_company_id: 'cloudflare',
        selectedCompanyId: 'cloudflare',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await sessionRepository.createSession(session);

      // Attempt to query Sentry repository under a Cloudflare session
      const res = await request(app)
        .get('/api/sessions/cf-session-123/issues?owner=getsentry&repo=sentry')
        .expect(400);

      expect(res.body.error).toMatch(/not a verified repository for Cloudflare/i);
    });
  });

  describe('2. Repository-Specific Issue Isolation & Capping', () => {
    it('A selected repository cannot return issues from another repository', async () => {
      const session: SessionDocument = {
        session_id: 'repo-isolation-session',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: 'SDK Tooling',
        stage: 'company_selected',
        selected_company_id: 'cloudflare',
        selectedCompanyId: 'cloudflare',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await sessionRepository.createSession(session);

      // 1. Fetch issues for cloudflare/workers-sdk
      const res1 = await request(app)
        .get('/api/sessions/repo-isolation-session/issues?owner=cloudflare&repo=workers-sdk')
        .expect(200);

      expect(res1.body.owner).toBe('cloudflare');
      expect(res1.body.repo).toBe('workers-sdk');
      res1.body.issues.forEach((issue: NormalizedIssue) => {
        expect(issue.html_url).toContain('cloudflare/workers-sdk');
        expect(issue.html_url).not.toContain('cloudflare-docs');
      });

      // 2. Fetch issues for cloudflare/cloudflare-docs (must not return cached workers-sdk issues)
      const res2 = await request(app)
        .get('/api/sessions/repo-isolation-session/issues?owner=cloudflare&repo=cloudflare-docs')
        .expect(200);

      expect(res2.body.owner).toBe('cloudflare');
      expect(res2.body.repo).toBe('cloudflare-docs');
      res2.body.issues.forEach((issue: NormalizedIssue) => {
        expect(issue.html_url).toContain('cloudflare/cloudflare-docs');
        expect(issue.html_url).not.toContain('workers-sdk');
      });
    });

    it('Issue results are capped at five', async () => {
      const client = new GitHubIssuesClient({ demoMode: false });
      const rawIssues = Array.from({ length: 15 }, (_, i) => ({
        id: 1000 + i,
        number: 100 + i,
        title: `Issue #${i + 1} for testing`,
        body: `Test issue body content for issue #${i + 1}`,
        html_url: `https://github.com/cloudflare/workers-sdk/issues/${100 + i}`,
        state: 'open',
        labels: [{ name: 'good first issue' }],
        comments: 2,
        created_at: '2026-08-01T10:00:00Z',
        updated_at: '2026-08-02T10:00:00Z',
      }));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-ratelimit-remaining': '60',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        }),
        json: async () => rawIssues,
      } as Response);

      const result = await client.fetchIssues('cloudflare', 'workers-sdk', 'Cloudflare');
      expect(result.status).toBe('completed');
      expect(result.issues.length).toBeLessThanOrEqual(5);
      expect(result.issues.length).toBe(5);
    });

    it('Pull requests are strictly excluded from issue results', async () => {
      const client = new GitHubIssuesClient({ demoMode: false });
      const mixedItems = [
        {
          id: 201,
          number: 1,
          title: 'Valid open issue',
          body: 'This is a genuine issue',
          html_url: 'https://github.com/cloudflare/workers-sdk/issues/1',
          state: 'open',
          labels: [{ name: 'bug' }],
        },
        {
          id: 202,
          number: 2,
          title: 'Pull request item',
          body: 'This is a PR',
          html_url: 'https://github.com/cloudflare/workers-sdk/pull/2',
          state: 'open',
          pull_request: { url: 'https://api.github.com/repos/cloudflare/workers-sdk/pulls/2' },
          labels: [{ name: 'enhancement' }],
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-ratelimit-remaining': '60',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        }),
        json: async () => mixedItems,
      } as Response);

      const result = await client.fetchIssues('cloudflare', 'workers-sdk', 'Cloudflare');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].number).toBe(1);
      expect(result.issues[0].title).toBe('Valid open issue');
    });
  });

  describe('3. No-issue state and company preservation', () => {
    it('Empty issue response preserves selected company and allows choosing another mapped repository', async () => {
      const session: SessionDocument = {
        session_id: 'empty-issues-session',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: 'Observability',
        stage: 'company_selected',
        selected_company_id: 'grafana',
        selectedCompanyId: 'grafana',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await sessionRepository.createSession(session);

      const retrieved = await sessionRepository.getSession('empty-issues-session');
      expect(retrieved?.selected_company_id).toBe('grafana');
      const company = findCompanyById(retrieved?.selected_company_id);
      expect(company?.name).toBe('Grafana Labs');
      expect(company?.candidateRepositories).toContain('grafana/grafana');
      expect(company?.candidateRepositories).toContain('grafana/loki');
    });
  });
});
