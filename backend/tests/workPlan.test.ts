import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import { InMemoryContextBriefRepository } from '../src/repositories/contextBriefRepository.js';
import { InMemoryWorkPlanRepository } from '../src/repositories/workPlanRepository.js';
import {
  WorkPlanService,
  validateWorkPlanContent,
  MAX_FILES_BUDGET,
  MAX_CHARS_PER_FILE,
  MAX_TOTAL_CHARS_BUDGET,
} from '../src/services/workPlanService.js';
import { GitHubIssuesClient } from '../src/services/githubIssuesClient.js';
import {
  NormalizedIssue,
  SessionDocument,
  ContributionWorkPlanContent,
} from '@web-slinger/shared';

describe('Day 4 Block 1: Read-Only Repository Evidence & Work Plan Service', () => {
  const mockIssue: NormalizedIssue = {
    id: 101,
    number: 42,
    title: 'Fix hydration mismatch with suspense boundary',
    body: 'Reproduction details in curriculum/challenges/lecture.md. Line 50 has inaccurate async wording.',
    state: 'open',
    html_url: 'https://github.com/facebook/react/issues/42',
    author: 'contributor-a',
    assignees: [],
    labels: ['good-first-issue', 'scope: curriculum'],
    comments_count: 3,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-02T12:00:00.000Z',
    source_url: 'https://github.com/facebook/react/issues/42',
    retrieved_at: '2026-08-02T12:00:00.000Z',
    tier: 'A',
    score: 95,
    reasons: ['Matched onboarding label: "good-first-issue"'],
    is_fixture: false,
  };

  const allowedUrls = new Set<string>([
    'https://github.com/facebook/react',
    'https://github.com/facebook/react/issues/42',
    'https://github.com/facebook/react/blob/main/curriculum/challenges/lecture.md',
    'https://github.com/facebook/react/blob/main/README.md',
    'https://github.com/facebook/react/blob/main/CONTRIBUTING.md',
  ]);

  const mockValidPlanContent: ContributionWorkPlanContent = {
    confirmedProblem: 'The fs lesson incorrectly claims every async method has a synchronous counterpart.',
    candidateFiles: [
      {
        path: 'curriculum/challenges/lecture.md',
        confidence: 'confirmed',
        rationale: 'Contains the exact paragraph discussing synchronous forms of fs methods.',
        evidenceUrls: [
          'https://github.com/facebook/react/issues/42',
          'https://github.com/facebook/react/blob/main/curriculum/challenges/lecture.md',
        ],
      },
    ],
    reviewedFiles: [
      {
        path: 'curriculum/challenges/lecture.md',
        sha: 'abc123sha456',
        summary: 'Lecture markdown document on Node core modules.',
        sourceUrl: 'https://github.com/facebook/react/blob/main/curriculum/challenges/lecture.md',
      },
    ],
    smallestChangePlan: [
      'Locate the paragraph in curriculum/challenges/lecture.md describing synchronous forms.',
      'Change "for every method, there is a synchronous form" to "for many methods, there is a synchronous form".',
      'Verify that adjacent examples match the revised wording.',
    ],
    risksAndUnknowns: [
      'Verify if other curriculum translation files exist that replicate this statement.',
    ],
    manualVerificationPlan: [
      'Run pnpm test:curriculum locally to confirm markdown formatting and tests.',
      'Preview the modified markdown file locally.',
    ],
    sourceCitations: [
      {
        claim: 'The lesson claims every method has a synchronous form.',
        sourceUrl: 'https://github.com/facebook/react/issues/42',
      },
      {
        claim: 'The affected text is located in curriculum/challenges/lecture.md.',
        sourceUrl: 'https://github.com/facebook/react/blob/main/curriculum/challenges/lecture.md',
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. File Evidence & Tree Source Retrieval (GET-Only)', () => {
    it('fetches and decodes exact file content via GitHub GET request', async () => {
      const client = new GitHubIssuesClient({ demoMode: false });
      const rawText = '# Sample React Documentation\n\nThis is raw documentation text.';
      const base64Content = Buffer.from(rawText, 'utf8').toString('base64');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          size: Buffer.byteLength(rawText),
          path: 'docs/intro.md',
          sha: 'sha-intro-1234',
          html_url: 'https://github.com/facebook/react/blob/main/docs/intro.md',
          content: base64Content,
          encoding: 'base64',
        }),
      } as Response);

      const evidence = await client.fetchFileContent('facebook', 'react', 'docs/intro.md', 'main');

      expect(evidence).not.toBeNull();
      expect(evidence?.path).toBe('docs/intro.md');
      expect(evidence?.content).toBe(rawText);
      expect(evidence?.isTruncated).toBe(false);
      expect(evidence?.sha).toBe('sha-intro-1234');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/facebook/react/contents/docs/intro.md?ref=main'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('enforces single-file size cap of 12,000 characters and records truncation', async () => {
      const client = new GitHubIssuesClient({ demoMode: false });
      const largeText = 'A'.repeat(15000);
      const base64Content = Buffer.from(largeText, 'utf8').toString('base64');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          size: 15000,
          path: 'docs/large.md',
          sha: 'sha-large-123',
          html_url: 'https://github.com/facebook/react/blob/main/docs/large.md',
          content: base64Content,
          encoding: 'base64',
        }),
      } as Response);

      const evidence = await client.fetchFileContent('facebook', 'react', 'docs/large.md', 'main');

      expect(evidence).not.toBeNull();
      expect(evidence?.isTruncated).toBe(true);
      expect(evidence?.omittedReason).toContain('12,000 characters');
      expect(evidence?.content.startsWith('A'.repeat(MAX_CHARS_PER_FILE))).toBe(true);
      expect(evidence?.content).toContain('[... OMITTED REMAINDER: Truncated at 12,000 characters ...]');
    });

    it('enforces total budget cap of 40,000 characters and max 8 files in SourcePackBuilder', async () => {
      const gitHubClient = new GitHubIssuesClient({ demoMode: false });
      const workPlanRepo = new InMemoryWorkPlanRepository();
      const service = new WorkPlanService(workPlanRepo, gitHubClient, false);

      // Mock tree with 12 candidate paths
      vi.spyOn(gitHubClient, 'findCandidatePaths').mockResolvedValue({
        candidatePaths: Array.from({ length: 12 }, (_, i) => `file_${i + 1}.md`),
        truncated: false,
      });

      // Mock each file to return 6,000 characters
      vi.spyOn(gitHubClient, 'fetchFileContent').mockImplementation(async (_owner, _repo, path) => {
        return {
          path: String(path),
          ref: 'main',
          sha: `sha-${path}`,
          htmlUrl: `https://github.com/facebook/react/blob/main/${path}`,
          retrievedAt: new Date().toISOString(),
          content: 'X'.repeat(6000),
          sizeBytes: 6000,
          isTruncated: false,
        };
      });

      const sourcePack = await service.buildSourcePack('facebook', 'react', mockIssue);

      // Max 8 files budget
      expect(sourcePack.fileEvidence.length).toBeLessThanOrEqual(MAX_FILES_BUDGET);

      // Total characters should not exceed 40,000
      const totalChars = sourcePack.fileEvidence.reduce((acc, f) => acc + f.content.length, 0);
      expect(totalChars).toBeLessThanOrEqual(MAX_TOTAL_CHARS_BUDGET);

      // Any file exceeding total budget has omittedReason set
      const omittedFiles = sourcePack.fileEvidence.filter((f) => f.omittedReason);
      expect(omittedFiles.length).toBeGreaterThan(0);
    });

    it('handles recursive tree truncation honestly', async () => {
      const client = new GitHubIssuesClient({ demoMode: false });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sha: 'tree-sha-root',
          truncated: true, // Truncated tree response
          tree: [
            { path: 'src/index.ts', type: 'blob', mode: '100644', sha: 'sha1', url: '...' },
            { path: 'curriculum/lecture.md', type: 'blob', mode: '100644', sha: 'sha2', url: '...' },
          ],
        }),
      } as Response);

      const result = await client.findCandidatePaths('facebook', 'react', ['lecture']);

      expect(result.truncated).toBe(true);
      expect(result.candidatePaths).toContain('curriculum/lecture.md');
    });
  });

  describe('2. Work Plan Content Validation & Security Boundaries', () => {
    it('accepts valid, evidence-bound work plan matching allowed source URLs', () => {
      const result = validateWorkPlanContent(mockValidPlanContent, allowedUrls);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.content).not.toBeNull();
      expect(result.content?.candidateFiles[0].confidence).toBe('confirmed');
    });

    it('rejects invalid JSON / missing required fields', () => {
      const invalidJson = {
        confirmedProblem: 'Missing candidateFiles and verification plan',
      };

      const result = validateWorkPlanContent(invalidJson, allowedUrls);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Schema validation failed');
    });

    it('rejects work plan when cited URL is outside the allowed source pack URL list', () => {
      const invalidCitationsPlan = {
        ...mockValidPlanContent,
        sourceCitations: [
          {
            claim: 'Unverified external fact',
            sourceUrl: 'https://unauthorized-external-site.com/doc',
          },
        ],
      };

      const result = validateWorkPlanContent(invalidCitationsPlan, allowedUrls);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not in the allowed source pack URL list');
    });

    it('rejects work plan when candidateFiles evidenceUrls are outside the allow-list', () => {
      const invalidCandidateUrlsPlan = {
        ...mockValidPlanContent,
        candidateFiles: [
          {
            path: 'curriculum/challenges/lecture.md',
            confidence: 'candidate' as const,
            rationale: 'Test file',
            evidenceUrls: ['https://attacker.com/malicious-link'],
          },
        ],
      };

      const result = validateWorkPlanContent(invalidCandidateUrlsPlan, allowedUrls);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not in the allowed source pack URL list');
    });

    it('rejects work plan containing forbidden autonomy language: git push / commit / diff / guaranteed acceptance', () => {
      const forbiddenSamples = [
        {
          ...mockValidPlanContent,
          smallestChangePlan: ['Run git push origin main to submit the patch.'],
        },
        {
          ...mockValidPlanContent,
          smallestChangePlan: ['git commit -m "fix issue"'],
        },
        {
          ...mockValidPlanContent,
          smallestChangePlan: ['diff --git a/file b/file\n+new code'],
        },
        {
          ...mockValidPlanContent,
          confirmedProblem: 'This contribution has guaranteed acceptance once submitted.',
        },
      ];

      for (const sample of forbiddenSamples) {
        const result = validateWorkPlanContent(sample, allowedUrls);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Forbidden autonomy language detected'))).toBe(
          true
        );
      }
    });
  });

  describe('3. WorkPlanService Persistence & Demo Mode', () => {
    it('generates fixture work plan in DEMO_MODE without calling external Vertex AI', async () => {
      const workPlanRepo = new InMemoryWorkPlanRepository();
      const gitHubClient = new GitHubIssuesClient({ demoMode: true });
      const service = new WorkPlanService(workPlanRepo, gitHubClient, true);

      const planDoc = await service.generateWorkPlan(
        '123e4567-e89b-12d3-a456-426614174000',
        mockIssue,
        'facebook',
        'react'
      );

      expect(planDoc.status).toBe('completed');
      expect(planDoc.is_fixture).toBe(true);
      expect(planDoc.plan?.candidateFiles.length).toBeGreaterThan(0);
      expect(planDoc.plan?.smallestChangePlan.length).toBeGreaterThan(0);

      // Verify persistence in InMemoryWorkPlanRepository
      const persisted = await workPlanRepo.getWorkPlan(
        '123e4567-e89b-12d3-a456-426614174000',
        mockIssue.number
      );
      expect(persisted).not.toBeNull();
      expect(persisted?.issue_number).toBe(mockIssue.number);
    });
  });

  describe('4. Selected-Issue Authorization & Route Integration Tests', () => {
    let sessionRepo: InMemorySessionRepository;
    let jobRepo: InMemoryJobRepository;
    let briefRepo: InMemoryContextBriefRepository;
    let workPlanRepo: InMemoryWorkPlanRepository;
    let workPlanService: WorkPlanService;
    let app: ReturnType<typeof createApp>;

    const validSession: SessionDocument = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      stack: ['React', 'TypeScript'],
      normalized_stack: ['react', 'typescript'],
      goal: null,
      stage: 'issue_selected',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      health: { status: 'healthy', message: 'Ready', timestamp: new Date().toISOString() },
      discovered_issues: [mockIssue], // Only issue #42 is authorized
    };

    beforeEach(async () => {
      sessionRepo = new InMemorySessionRepository();
      jobRepo = new InMemoryJobRepository();
      briefRepo = new InMemoryContextBriefRepository();
      workPlanRepo = new InMemoryWorkPlanRepository();
      workPlanService = new WorkPlanService(workPlanRepo, new GitHubIssuesClient({ demoMode: true }), true);

      await sessionRepo.createSession(validSession);

      app = createApp(
        sessionRepo,
        jobRepo,
        undefined,
        new GitHubIssuesClient({ demoMode: true }),
        undefined,
        undefined,
        workPlanService
      );
    });

    it('rejects POST when issue is NOT part of session candidate issues (Selected-Issue Authorization)', async () => {
      const res = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/99999/work-plan')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('is not a candidate issue in this session');
    });

    it('rejects GET when issue is NOT part of session candidate issues', async () => {
      const res = await request(app)
        .get('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/99999/work-plan')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('is not a candidate issue in this session');
    });

    it('rejects POST when session does not exist', async () => {
      const res = await request(app)
        .post('/api/sessions/00000000-0000-0000-0000-000000000000/issues/42/work-plan')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    it('generates, persists, and retrieves contribution work plan for authorized issue #42', async () => {
      const postRes = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/work-plan')
        .send();

      expect(postRes.status).toBe(200);
      expect(postRes.body.session_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(postRes.body.issue_number).toBe(42);
      expect(postRes.body.status).toBe('completed');
      expect(postRes.body.plan).not.toBeNull();
      expect(postRes.body.plan.candidateFiles.length).toBeGreaterThan(0);
      expect(postRes.body.plan.smallestChangePlan.length).toBeGreaterThan(0);
      expect(postRes.body.plan.manualVerificationPlan.length).toBeGreaterThan(0);

      // Now GET the persisted work plan
      const getRes = await request(app)
        .get('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/work-plan')
        .send();

      expect(getRes.status).toBe(200);
      expect(getRes.body.issue_number).toBe(42);
      expect(getRes.body.status).toBe('completed');
      expect(getRes.body.plan.confirmedProblem).toBe(postRes.body.plan.confirmedProblem);
    });
  });
});
