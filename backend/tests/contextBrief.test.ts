import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import { InMemoryContextBriefRepository } from '../src/repositories/contextBriefRepository.js';
import {
  SourcePackBuilder,
  MAX_COMMENTS,
  MAX_CONTRIBUTING_CHARS,
  MAX_README_CHARS,
} from '../src/services/sourcePackBuilder.js';
import {
  ContextBriefService,
  validateBriefContent,
  FORBIDDEN_LANGUAGE_PATTERNS,
} from '../src/services/contextBriefService.js';
import { GitHubIssuesClient } from '../src/services/githubIssuesClient.js';
import { NormalizedIssue, SessionDocument } from '@web-slinger/shared';

describe('Day 3 Source-Grounded Context Brief Service & Routes', () => {
  const mockIssue: NormalizedIssue = {
    id: 101,
    number: 42,
    title: 'Fix hydration mismatch with suspense boundary',
    body: 'Detailed description of the suspense hydration mismatch.',
    html_url: 'https://github.com/facebook/react/issues/42',
    state: 'open',
    labels: ['good first issue', 'bug'],
    assignees: [],
    author: 'alice',
    comments_count: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_url: 'https://github.com/facebook/react/issues/42',
    retrieved_at: new Date().toISOString(),
    tier: 'A',
    score: 95,
    reasons: ['Matched onboarding label: "good first issue"'],
    is_fixture: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Source Pack Builder & Size Caps', () => {
    it('enforces size caps: max 10 comments, 12000 chars contributing, 8000 chars readme', async () => {
      // Mock GitHub API responses with oversize content
      const largeContributing = 'C'.repeat(20000);
      const largeReadme = 'R'.repeat(15000);
      const fifteenComments = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        user: { login: `user_${i + 1}` },
        body: `Comment number ${i + 1}`,
        created_at: new Date().toISOString(),
        html_url: `https://github.com/facebook/react/issues/42#issuecomment-${i + 1}`,
      }));

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/comments')) {
          return {
            ok: true,
            json: async () => fifteenComments,
          } as Response;
        }
        if (url.includes('CONTRIBUTING.md')) {
          return {
            ok: true,
            json: async () => ({
              content: Buffer.from(largeContributing).toString('base64'),
              html_url: 'https://github.com/facebook/react/blob/main/CONTRIBUTING.md',
            }),
          } as Response;
        }
        if (url.includes('/readme')) {
          return {
            ok: true,
            json: async () => ({
              content: Buffer.from(largeReadme).toString('base64'),
              html_url: 'https://github.com/facebook/react/blob/main/README.md',
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            description: 'A JavaScript library for building user interfaces',
            language: 'JavaScript',
            default_branch: 'main',
            html_url: 'https://github.com/facebook/react',
          }),
        } as Response;
      });

      const builder = new SourcePackBuilder({
        config: {
          owner: 'facebook',
          repo: 'react',
          token: 'test_token',
          apiVersion: '2022-11-28',
          pageSize: 30,
          maxIssues: 30,
          isConfigured: true,
          tokenPresent: true,
          tokenFingerprint: 'abc',
        },
        demoMode: false,
      });

      const pack = await builder.buildSourcePack(mockIssue, 'facebook', 'react');

      // 1. Primary issue source + 1 repo metadata + 10 comments (capped from 15) + 1 contrib + 1 readme = 14 sources
      const commentSources = pack.sources.filter((s) => s.title.includes('Comment by'));
      expect(commentSources.length).toBe(MAX_COMMENTS);
      expect(commentSources.length).toBe(10);

      // Verify Contributing cap
      const contribSource = pack.sources.find((s) => s.title.includes('Contributing Guide'));
      expect(contribSource).toBeDefined();
      expect(contribSource!.content!.length).toBeLessThanOrEqual(MAX_CONTRIBUTING_CHARS);

      // Verify Readme cap
      const readmeSource = pack.sources.find((s) => s.title.includes('README'));
      expect(readmeSource).toBeDefined();
      expect(readmeSource!.content!.length).toBeLessThanOrEqual(MAX_README_CHARS);

      // Verify allowedSourceUrls contains exact URLs
      expect(pack.allowedSourceUrls.has(mockIssue.html_url)).toBe(true);
      expect(pack.allowedSourceUrls.has(contribSource!.url)).toBe(true);
      expect(pack.allowedSourceUrls.has(readmeSource!.url)).toBe(true);
    });

    it('returns synthetic fixture source pack when demoMode is true', async () => {
      const builder = new SourcePackBuilder({
        demoMode: true,
      });

      const pack = await builder.buildSourcePack(mockIssue, 'facebook', 'react');
      expect(pack.sources.length).toBeGreaterThanOrEqual(4);
      expect(pack.allowedSourceUrls.has(mockIssue.html_url)).toBe(true);
    });
  });

  describe('2. Brief Content Validation & Security Boundaries', () => {
    const allowedUrls = new Set([
      'https://github.com/facebook/react/issues/42',
      'https://github.com/facebook/react/blob/main/CONTRIBUTING.md',
    ]);

    const validRawBrief = {
      summary: 'Issue #42 describes a hydration mismatch in suspense boundaries.',
      likelyContributionShape: 'Refactor boundary reconciliation and add unit test.',
      whatToReadFirst: [
        {
          instruction: 'Read issue description and reproduction steps.',
          sourceUrl: 'https://github.com/facebook/react/issues/42',
        },
      ],
      unknownsToVerify: ['Verify reproduction locally.'],
      suggestedFirstQuestion: 'Is there a reproduction test case available?',
      sourceCitations: [
        {
          claim: 'Hydration fails when boundary is async.',
          sourceUrl: 'https://github.com/facebook/react/issues/42',
        },
      ],
    };

    it('accepts valid, evidence-bound brief content matching allowed source URLs', () => {
      const result = validateBriefContent(validRawBrief, allowedUrls);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.content).toBeDefined();
    });

    it('rejects invalid JSON / missing required fields', () => {
      const badJson = { summary: 'Only summary provided' };
      const result = validateBriefContent(badJson, allowedUrls);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Schema validation failed');
    });

    it('rejects brief when cited URL is outside the allowed source pack allow-list', () => {
      const unallowedCitation = {
        ...validRawBrief,
        sourceCitations: [
          {
            claim: 'Unverified external claim.',
            sourceUrl: 'https://malicious-external-site.com/exploit',
          },
        ],
      };
      const result = validateBriefContent(unallowedCitation, allowedUrls);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not in the allowed source pack URL list'))).toBe(true);
    });

    it('rejects brief when whatToReadFirst URL is outside the allowed source pack allow-list', () => {
      const unallowedReadFirst = {
        ...validRawBrief,
        whatToReadFirst: [
          {
            instruction: 'Read external blog.',
            sourceUrl: 'https://external-blog.com/post',
          },
        ],
      };
      const result = validateBriefContent(unallowedReadFirst, allowedUrls);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not in the allowed source pack URL list'))).toBe(true);
    });

    it('rejects brief containing forbidden autonomy language: git push / commit / diff / guaranteed acceptance', () => {
      const forbiddenSamples = [
        {
          ...validRawBrief,
          likelyContributionShape: 'Run git push origin feature-branch to submit your code.',
        },
        {
          ...validRawBrief,
          likelyContributionShape: 'Run git commit -m "fix bug" to commit.',
        },
        {
          ...validRawBrief,
          likelyContributionShape: 'diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts',
        },
        {
          ...validRawBrief,
          summary: 'This pull request is guaranteed to be merged immediately.',
        },
      ];

      for (const sample of forbiddenSamples) {
        const result = validateBriefContent(sample, allowedUrls);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Forbidden autonomy language'))).toBe(true);
      }
    });
  });

  describe('3. ContextBriefService & Persistence', () => {
    it('generates fixture brief in DEMO_MODE without calling external Vertex AI', async () => {
      const briefRepo = new InMemoryContextBriefRepository();
      const service = new ContextBriefService(briefRepo, true);

      const sourcePack = {
        issue: mockIssue,
        sources: [
          {
            title: `Issue #${mockIssue.number}`,
            url: mockIssue.html_url,
            retrievedAt: new Date().toISOString(),
          },
        ],
        allowedSourceUrls: new Set([mockIssue.html_url]),
        sourcePackVersion: '1.0',
      };

      const doc = await service.generateAndPersistBrief('sess_123', sourcePack);

      expect(doc.status).toBe('completed');
      expect(doc.is_fixture).toBe(true);
      expect(doc.brief?.summary).toContain('[DEMO FIXTURE]');

      // Check persistence
      const saved = await briefRepo.getBrief('sess_123', mockIssue.number);
      expect(saved).toBeDefined();
      expect(saved?.issue_number).toBe(mockIssue.number);
    });
  });

  describe('4. Selected-Issue Authorization & Route Integration Tests', () => {
    let sessionRepo: InMemorySessionRepository;
    let briefRepo: InMemoryContextBriefRepository;
    let app: Express.Application;

    const testSessionId = '123e4567-e89b-12d3-a456-426614174000';

    beforeEach(async () => {
      sessionRepo = new InMemorySessionRepository();
      briefRepo = new InMemoryContextBriefRepository();

      const session: SessionDocument = {
        session_id: testSessionId,
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'researching',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        discovered_issues: [mockIssue], // Only issue #42 is authorized!
      };

      await sessionRepo.createSession(session);

      const sourcePackBuilder = new SourcePackBuilder({ demoMode: true });
      const contextBriefService = new ContextBriefService(briefRepo, true);

      app = createApp(
        sessionRepo,
        new InMemoryJobRepository(),
        undefined,
        new GitHubIssuesClient({ demoMode: true }),
        sourcePackBuilder,
        contextBriefService
      );
    });

    it('rejects POST when issue is NOT part of session candidate issues (Selected-Issue Authorization)', async () => {
      // Issue #999 was never discovered in this session
      const res = await request(app)
        .post(`/api/sessions/${testSessionId}/issues/999/context-brief`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('is not a candidate issue in this session');
    });

    it('rejects POST when session does not exist', async () => {
      const res = await request(app)
        .post('/api/sessions/00000000-0000-0000-0000-000000000000/issues/42/context-brief')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    it('rejects POST when session is expired', async () => {
      const expiredSessionId = '11111111-2222-3333-4444-555555555555';
      await sessionRepo.createSession({
        session_id: expiredSessionId,
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'created',
        created_at: new Date(Date.now() - 100000000).toISOString(),
        updated_at: new Date(Date.now() - 100000000).toISOString(),
        expires_at: new Date(Date.now() - 50000).toISOString(),
        discovered_issues: [mockIssue],
      });

      const res = await request(app)
        .post(`/api/sessions/${expiredSessionId}/issues/42/context-brief`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session has expired');
    });

    it('generates, persists, and retrieves context brief for authorized issue #42', async () => {
      // GET before generation -> 404
      const getInitial = await request(app)
        .get(`/api/sessions/${testSessionId}/issues/42/context-brief`);
      expect(getInitial.status).toBe(404);

      // POST generate brief
      const postRes = await request(app)
        .post(`/api/sessions/${testSessionId}/issues/42/context-brief`)
        .send();

      expect(postRes.status).toBe(200);
      expect(postRes.body.session_id).toBe(testSessionId);
      expect(postRes.body.issue_number).toBe(42);
      expect(postRes.body.status).toBe('completed');
      expect(postRes.body.brief).toBeDefined();
      expect(postRes.body.brief.summary).toBeDefined();
      expect(postRes.body.sources.length).toBeGreaterThanOrEqual(1);

      // GET after generation -> 200 with persisted brief
      const getRes = await request(app)
        .get(`/api/sessions/${testSessionId}/issues/42/context-brief`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.issue_number).toBe(42);
      expect(getRes.body.brief.summary).toBe(postRes.body.brief.summary);
    });
  });
});
