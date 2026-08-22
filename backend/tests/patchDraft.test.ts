import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import { InMemoryWorkPlanRepository } from '../src/repositories/workPlanRepository.js';
import { InMemoryPatchDraftRepository } from '../src/repositories/patchDraftRepository.js';
import { InMemoryVerificationPlanRepository } from '../src/repositories/verificationPlanRepository.js';
import {
  PatchDraftService,
  parseAndValidateDiff,
  MAX_PATCH_CHANGED_FILES,
  MAX_PATCH_CHANGED_LINES,
} from '../src/services/patchDraftService.js';
import { WorkPlanService } from '../src/services/workPlanService.js';
import { VerificationPlanService } from '../src/services/verificationPlanService.js';
import { GitHubIssuesClient } from '../src/services/githubIssuesClient.js';
import {
  NormalizedIssue,
  SessionDocument,
  ContributionWorkPlanDocument,
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_VERIFICATION_DISCLAIMER,
} from '@web-slinger/shared';

describe('Day 4 Block 2: User-Gated Editable Patch Draft & Manual Verification Preparation', () => {
  const mockIssue: NormalizedIssue = {
    id: 101,
    number: 42,
    title: 'Fix documentation inaccuracy in fs lesson',
    body: 'Details in curriculum/challenges/lecture.md. Line 45 claims every method has a synchronous version.',
    state: 'open',
    html_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/42',
    author: 'contributor-a',
    assignees: [],
    labels: ['good-first-issue'],
    comments_count: 2,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-02T12:00:00.000Z',
    source_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/42',
    retrieved_at: '2026-08-02T12:00:00.000Z',
    tier: 'A',
    score: 95,
    reasons: ['Matched onboarding label: "good-first-issue"'],
    is_fixture: false,
  };

  const mockFileEvidence = [
    {
      path: 'curriculum/challenges/lecture.md',
      ref: 'main',
      sha: 'sha-lecture-12345',
      htmlUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/lecture.md',
      retrievedAt: new Date().toISOString(),
      content: '# Lecture\n\nThe fs module methods are asynchronous by default, but for every method, there is a synchronous form.\n',
      sizeBytes: 120,
      isTruncated: false,
    },
  ];

  const mockWorkPlanDoc: ContributionWorkPlanDocument = {
    session_id: '123e4567-e89b-12d3-a456-426614174000',
    issue_number: 42,
    status: 'completed',
    plan: {
      confirmedProblem: 'The fs lesson incorrectly claims every method has a synchronous version.',
      candidateFiles: [
        {
          path: 'curriculum/challenges/lecture.md',
          confidence: 'confirmed',
          rationale: 'Primary curriculum document.',
          evidenceUrls: ['https://github.com/freeCodeCamp/freeCodeCamp/issues/42'],
        },
      ],
      reviewedFiles: [
        {
          path: 'curriculum/challenges/lecture.md',
          sha: 'sha-lecture-12345',
          summary: 'Lecture doc',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/lecture.md',
        },
      ],
      smallestChangePlan: ['Change "every method" to "many methods".'],
      risksAndUnknowns: ['Check if other lectures replicate this wording.'],
      manualVerificationPlan: ['Run pnpm test:curriculum to verify markdown formatting.'],
      sourceCitations: [
        {
          claim: 'Issue 42 reports wording error.',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/42',
        },
      ],
    },
    file_evidence: mockFileEvidence,
    model_id: 'gemini-3.7-flash',
    source_pack_version: '1.0',
    generated_at: new Date().toISOString(),
    validation_errors: [],
    is_fixture: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Diff Parsing, Sizing & Forbidden File Boundaries', () => {
    const reviewedPaths = new Set(['curriculum/challenges/lecture.md', 'docs/intro.md']);

    it('accepts valid, bounded diff modifying reviewed sources only', () => {
      const validDiff = `--- a/curriculum/challenges/lecture.md
+++ b/curriculum/challenges/lecture.md
@@ -45,3 +45,3 @@
-The fs module methods are asynchronous by default, but for every method, there's a synchronous form.
+The fs module methods are asynchronous by default, but for many methods, there's a synchronous form.
`;

      const summary = parseAndValidateDiff(validDiff, reviewedPaths);

      expect(summary.errors).toHaveLength(0);
      expect(summary.changedFiles).toEqual(['curriculum/challenges/lecture.md']);
      expect(summary.totalChangedLines).toBe(2);
      expect(summary.addedLines).toBe(1);
      expect(summary.removedLines).toBe(1);
    });

    it('rejects diff with unreviewed / unknown changed files', () => {
      const unreviewedDiff = `--- a/unknown/source/file.js
+++ b/unknown/source/file.js
@@ -1 +1 @@
-old code
+new code
`;

      const summary = parseAndValidateDiff(unreviewedDiff, reviewedPaths);

      expect(summary.errors.length).toBeGreaterThan(0);
      expect(summary.errors[0]).toContain('not included in the human-reviewed sources list');
    });

    it('rejects diff modifying forbidden dependency manifests and lockfiles (package.json, pnpm-lock.yaml, requirements.txt)', () => {
      const forbiddenSamples = [
        '--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-"name": "a"\n+"name": "b"\n',
        '--- a/pnpm-lock.yaml\n+++ b/pnpm-lock.yaml\n@@ -1 +1 @@\n-lock: 1\n+lock: 2\n',
        '--- a/requirements.txt\n+++ b/requirements.txt\n@@ -1 +1 @@\n-pytest==7.0\n+pytest==8.0\n',
        '--- a/Cargo.lock\n+++ b/Cargo.lock\n@@ -1 +1 @@\n-v=1\n+v=2\n',
      ];

      for (const sample of forbiddenSamples) {
        // Even if nominally in reviewedPaths, forbidden file check must reject it
        const summary = parseAndValidateDiff(sample, new Set(['package.json', 'pnpm-lock.yaml', 'requirements.txt', 'Cargo.lock']));
        expect(summary.errors.some((e) => e.includes('prohibited from patch drafts'))).toBe(true);
      }
    });

    it('rejects diff modifying forbidden CI workflows, environment files, keys, and policy files', () => {
      const forbiddenSamples = [
        '--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1 +1 @@\n-run: test\n+run: echo\n',
        '--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-KEY=1\n+KEY=2\n',
        '--- a/cert.pem\n+++ b/cert.pem\n@@ -1 +1 @@\n-AAA\n+BBB\n',
        '--- a/SECURITY.md\n+++ b/SECURITY.md\n@@ -1 +1 @@\n-old\n+new\n',
        '--- a/LICENSE\n+++ b/LICENSE\n@@ -1 +1 @@\n-MIT\n+GPL\n',
      ];

      for (const sample of forbiddenSamples) {
        const summary = parseAndValidateDiff(
          sample,
          new Set(['.github/workflows/ci.yml', '.env', 'cert.pem', 'SECURITY.md', 'LICENSE'])
        );
        expect(summary.errors.some((e) => e.includes('prohibited'))).toBe(true);
      }
    });

    it('rejects diff exceeding 3 changed files limit', () => {
      const multiFileDiff = `--- a/file1.md
+++ b/file1.md
@@ -1 +1 @@
-1
+2
--- a/file2.md
+++ b/file2.md
@@ -1 +1 @@
-1
+2
--- a/file3.md
+++ b/file3.md
@@ -1 +1 @@
-1
+2
--- a/file4.md
+++ b/file4.md
@@ -1 +1 @@
-1
+2
`;

      const summary = parseAndValidateDiff(
        multiFileDiff,
        new Set(['file1.md', 'file2.md', 'file3.md', 'file4.md'])
      );

      expect(summary.errors.some((e) => e.includes(`exceeds maximum of ${MAX_PATCH_CHANGED_FILES} changed files`))).toBe(true);
    });

    it('rejects diff exceeding 120 total changed lines limit', () => {
      const largeAddedLines = Array.from({ length: 130 }, (_, i) => `+added line ${i + 1}`).join('\n');
      const largeDiff = `--- a/curriculum/challenges/lecture.md
+++ b/curriculum/challenges/lecture.md
@@ -1,1 +1,130 @@
-old line
${largeAddedLines}
`;

      const summary = parseAndValidateDiff(largeDiff, reviewedPaths);

      expect(summary.errors.some((e) => e.includes(`exceeds maximum of ${MAX_PATCH_CHANGED_LINES} changed lines`))).toBe(true);
    });
  });

  describe('2. Source Review Verification & Affirmation Gating', () => {
    it('rejects source review with mismatched SHA (409 Conflict check)', () => {
      const service = new PatchDraftService(new InMemoryPatchDraftRepository(), true);
      const mismatchedSources = [
        { path: 'curriculum/challenges/lecture.md', sha: 'wrong-sha-6789' },
      ];

      const check = service.verifyReviewedSources(mismatchedSources, mockFileEvidence);

      expect(check.valid).toBe(false);
      expect(check.error).toContain('SHA mismatch');
    });

    it('rejects source review when file was not retrieved in session evidence', () => {
      const service = new PatchDraftService(new InMemoryPatchDraftRepository(), true);
      const unretrievedSources = [
        { path: 'unretrieved/file.md', sha: 'some-sha' },
      ];

      const check = service.verifyReviewedSources(unretrievedSources, mockFileEvidence);

      expect(check.valid).toBe(false);
      expect(check.error).toContain('was not found in the retrieved evidence');
    });

    it('accepts matching reviewed sources with exact retrieved SHA', () => {
      const service = new PatchDraftService(new InMemoryPatchDraftRepository(), true);
      const validSources = [
        { path: 'curriculum/challenges/lecture.md', sha: 'sha-lecture-12345' },
      ];

      const check = service.verifyReviewedSources(validSources, mockFileEvidence);

      expect(check.valid).toBe(true);
    });
  });

  describe('3. Route Integration Tests (POST, GET, PUT patch-draft & POST verification-plan)', () => {
    let sessionRepo: InMemorySessionRepository;
    let jobRepo: InMemoryJobRepository;
    let workPlanRepo: InMemoryWorkPlanRepository;
    let patchDraftRepo: InMemoryPatchDraftRepository;
    let vPlanRepo: InMemoryVerificationPlanRepository;
    let patchDraftService: PatchDraftService;
    let vPlanService: VerificationPlanService;
    let app: ReturnType<typeof createApp>;

    const validSession: SessionDocument = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      stack: ['JavaScript', 'Node.js'],
      normalized_stack: ['javascript', 'node.js'],
      goal: null,
      stage: 'issue_selected',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      health: { status: 'healthy', message: 'Ready', timestamp: new Date().toISOString() },
      discovered_issues: [mockIssue],
    };

    beforeEach(async () => {
      sessionRepo = new InMemorySessionRepository();
      jobRepo = new InMemoryJobRepository();
      workPlanRepo = new InMemoryWorkPlanRepository();
      patchDraftRepo = new InMemoryPatchDraftRepository();
      vPlanRepo = new InMemoryVerificationPlanRepository();

      await sessionRepo.createSession(validSession);
      await workPlanRepo.saveWorkPlan(mockWorkPlanDoc);

      const workPlanService = new WorkPlanService(
        workPlanRepo,
        new GitHubIssuesClient({ demoMode: true }),
        true
      );
      patchDraftService = new PatchDraftService(patchDraftRepo, true);
      vPlanService = new VerificationPlanService(vPlanRepo, true);

      app = createApp(
        sessionRepo,
        jobRepo,
        undefined,
        new GitHubIssuesClient({ demoMode: true }),
        undefined,
        undefined,
        workPlanService,
        patchDraftService,
        vPlanService
      );
    });

    it('POST patch-draft returns 409 Conflict when userAffirmation is missing or false', async () => {
      const res = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/patch-draft')
        .send({
          reviewedSources: [{ path: 'curriculum/challenges/lecture.md', sha: 'sha-lecture-12345' }],
          userAffirmation: false,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('User source review and affirmative agreement are required');
    });

    it('POST patch-draft returns 409 Conflict when reviewedSources has mismatched SHA', async () => {
      const res = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/patch-draft')
        .send({
          reviewedSources: [{ path: 'curriculum/challenges/lecture.md', sha: 'tampered-or-wrong-sha' }],
          userAffirmation: true,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('SHA mismatch');
    });

    it('POST patch-draft succeeds when reviewedSources and userAffirmation are valid', async () => {
      const res = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/patch-draft')
        .send({
          reviewedSources: [{ path: 'curriculum/challenges/lecture.md', sha: 'sha-lecture-12345' }],
          userAffirmation: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.user_affirmation).toBe(MANDATORY_USER_AFFIRMATION);
      expect(res.body.changed_files).toEqual(['curriculum/challenges/lecture.md']);
      expect(res.body.diff_content).toContain('--- a/curriculum/challenges/lecture.md');
      expect(res.body.is_user_edited).toBe(false);
      expect(res.body.patch_id).toBeDefined();

      const patchId = res.body.patch_id;

      // Test GET /patch-draft/:patchId
      const getRes = await request(app)
        .get(`/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/patch-draft/${patchId}`)
        .send();

      expect(getRes.status).toBe(200);
      expect(getRes.body.patch_id).toBe(patchId);
      expect(getRes.body.diff_content).toBe(res.body.diff_content);

      // Test PUT /patch-draft/:patchId with user-edited diff
      const editedDiff = `--- a/curriculum/challenges/lecture.md
+++ b/curriculum/challenges/lecture.md
@@ -45,3 +45,3 @@
-The fs module methods are asynchronous by default, but for every method, there's a synchronous form.
+The fs module methods are asynchronous by default, but for most common methods, there's a synchronous form.
`;

      const putRes = await request(app)
        .put(`/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/patch-draft/${patchId}`)
        .send({ diffContent: editedDiff });

      expect(putRes.status).toBe(200);
      expect(putRes.body.diff_content).toBe(editedDiff);
      expect(putRes.body.is_user_edited).toBe(true);
      expect(putRes.body.status).toBe('completed');
    });

    it('POST verification-plan creates a manual checklist where every item starts with status: "not_verified"', async () => {
      const res = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/issues/42/verification-plan')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(res.body.issue_number).toBe(42);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.disclaimer).toBe(MANDATORY_VERIFICATION_DISCLAIMER);
      expect(res.body.plan.checklist.length).toBeGreaterThan(0);

      // Every checklist item must strictly be not_verified
      for (const item of res.body.plan.checklist) {
        expect(item.status).toBe('not_verified');
        expect(item.title).toBeDefined();
        expect(item.description).toBeDefined();
      }
    });
  });
});
