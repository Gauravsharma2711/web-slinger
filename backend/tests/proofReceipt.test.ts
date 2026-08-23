import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import {
  InMemoryVerificationRecordRepository,
  InMemoryProofReceiptRepository,
} from '../src/repositories/proofReceiptRepository.js';
import { InMemoryVerificationPlanRepository } from '../src/repositories/verificationPlanRepository.js';
import { InMemoryPatchDraftRepository } from '../src/repositories/patchDraftRepository.js';
import { ProofReceiptService } from '../src/services/proofReceiptService.js';
import {
  SessionDocument,
  NormalizedIssue,
  MANDATORY_RECEIPT_ATTESTATION,
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_VERIFICATION_DISCLAIMER,
  PatchDraftDocument,
  VerificationPlanDocument,
} from '@web-slinger/shared';

describe('Proof Receipt & Verification Records API (Day 5 Block 1)', () => {
  let sessionRepo: InMemorySessionRepository;
  let jobRepo: InMemoryJobRepository;
  let verificationRecordRepo: InMemoryVerificationRecordRepository;
  let proofReceiptRepo: InMemoryProofReceiptRepository;
  let verificationPlanRepo: InMemoryVerificationPlanRepository;
  let patchDraftRepo: InMemoryPatchDraftRepository;
  let proofReceiptService: ProofReceiptService;
  let app: ReturnType<typeof createApp>;

  const mockSessionId = 'd93a9247-11e7-4c3b-8d3e-e4d855525703';
  const mockIssueNumber = 69622;
  const mockPatchId = '49a4ad26-6eee-4e59-a448-9eca4d8c5894';

  const mockIssue: NormalizedIssue = {
    id: 69622,
    number: mockIssueNumber,
    title: 'fs lesson incorrectly states that every method has a synchronous version',
    body: 'In the Node core modules lesson...',
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
  };

  const mockSession: SessionDocument = {
    session_id: mockSessionId,
    stack: ['TypeScript', 'Node.js'],
    normalized_stack: ['typescript', 'node.js'],
    goal: 'Open source contribution',
    stage: 'issue_selected',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    discovered_issues: [mockIssue],
  };

  const mockPatchDraft: PatchDraftDocument = {
    patch_id: mockPatchId,
    session_id: mockSessionId,
    issue_number: mockIssueNumber,
    status: 'completed',
    diff_content: `--- a/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md
+++ b/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md
@@ -10,3 +10,3 @@
-Almost every method in the fs module has a synchronous version.
+Most common methods in the fs module have synchronous versions.`,
    user_affirmation: MANDATORY_USER_AFFIRMATION,
    reviewed_at: new Date().toISOString(),
    reviewed_sources: [
      {
        path: 'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
        sha: 'abc1234567890',
      },
    ],
    changed_files: [
      'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
    ],
    total_changed_lines: 2,
    model_id: 'gemini-3.7-flash',
    generated_at: new Date().toISOString(),
    validation_errors: [],
    warnings: [],
    is_user_edited: false,
    is_fixture: false,
  };

  const mockVerificationPlan: VerificationPlanDocument = {
    session_id: mockSessionId,
    issue_number: mockIssueNumber,
    plan: {
      checklist: [
        {
          id: 'check-1',
          title: 'Review updated curriculum phrasing',
          description: 'Ensure accurate description of Node fs module methods.',
          suggestedCommand: 'git diff',
          status: 'not_verified',
        },
        {
          id: 'check-2',
          title: 'Execute local curriculum tests',
          description: 'Verify markdown structure passes test suite.',
          suggestedCommand: 'pnpm run test:curriculum',
          status: 'not_verified',
        },
      ],
      disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
      sourceCitations: [
        {
          claim: 'Node fs module accuracy issue',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        },
      ],
    },
    model_id: 'gemini-3.7-flash',
    generated_at: new Date().toISOString(),
    is_fixture: false,
  };

  beforeEach(async () => {
    sessionRepo = new InMemorySessionRepository();
    jobRepo = new InMemoryJobRepository();
    verificationRecordRepo = new InMemoryVerificationRecordRepository();
    proofReceiptRepo = new InMemoryProofReceiptRepository();
    verificationPlanRepo = new InMemoryVerificationPlanRepository();
    patchDraftRepo = new InMemoryPatchDraftRepository();

    await sessionRepo.createSession(mockSession);
    await patchDraftRepo.savePatchDraft(mockPatchDraft);
    await verificationPlanRepo.saveVerificationPlan(mockVerificationPlan);

    proofReceiptService = new ProofReceiptService({
      verificationRecordRepo,
      proofReceiptRepo,
      verificationPlanRepo,
      patchDraftRepo,
      demoMode: false,
    });

    app = createApp(
      sessionRepo,
      jobRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      proofReceiptService
    );
  });

  it('synthesizes default not_run verification records from verification plan when none are saved', async () => {
    const res = await request(app)
      .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .expect(200);

    expect(res.body.records).toHaveLength(2);
    expect(res.body.records[0].status).toBe('not_run');
    expect(res.body.records[0].checkId).toBe('check-1');
    expect(res.body.records[1].status).toBe('not_run');
    expect(res.body.records[1].checkId).toBe('check-2');
  });

  it('saves human-reported verification records and requires non-empty user notes', async () => {
    // 1. Rejects empty user notes
    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .send({
        records: [
          {
            checkId: 'check-1',
            label: 'Review updated curriculum phrasing',
            command: 'git diff',
            status: 'passed',
            userNotes: '',
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(400);

    // 2. Successfully saves valid user-entered records
    const saveRes = await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .send({
        records: [
          {
            checkId: 'check-1',
            label: 'Review updated curriculum phrasing',
            command: 'git diff',
            status: 'passed',
            userNotes: 'Inspected git diff locally, verified accurate wording.',
            recordedAt: new Date().toISOString(),
          },
          {
            checkId: 'check-2',
            label: 'Execute local curriculum tests',
            command: 'pnpm run test:curriculum',
            status: 'passed',
            userNotes: 'Ran curriculum tests on local branch; 42 tests passed.',
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200);

    expect(saveRes.body.records).toHaveLength(2);
    expect(saveRes.body.records[0].status).toBe('passed');
    expect(saveRes.body.records[1].status).toBe('passed');

    // 3. GET retrieves persisted records
    const getRes = await request(app)
      .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .expect(200);

    expect(getRes.body.records).toHaveLength(2);
    expect(getRes.body.records[0].userNotes).toContain('Inspected git diff');
  });

  it('rejects Proof Receipt generation with HTTP 409 when user attestation is missing or false', async () => {
    // Missing attestation
    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/proof-receipt`)
      .send({
        branchName: 'fix/node-fs-lesson',
      })
      .expect(409);

    // False attestation
    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/proof-receipt`)
      .send({
        userAttestation: false,
        branchName: 'fix/node-fs-lesson',
      })
      .expect(409);
  });

  it('generates an incomplete Proof Receipt when any check remains not_run', async () => {
    // Save records with 1 check still not_run
    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .send({
        records: [
          {
            checkId: 'check-1',
            label: 'Review updated curriculum phrasing',
            command: 'git diff',
            status: 'passed',
            userNotes: 'Inspected git diff locally.',
            recordedAt: new Date().toISOString(),
          },
          {
            checkId: 'check-2',
            label: 'Execute local curriculum tests',
            command: 'pnpm run test:curriculum',
            status: 'not_run',
            userNotes: 'Not executed yet.',
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200);

    const res = await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/proof-receipt`)
      .send({
        userAttestation: true,
        branchName: 'fix/node-fs-lesson',
      })
      .expect(200);

    expect(res.body.status).toBe('incomplete');
    expect(res.body.user_attestation).toBe(MANDATORY_RECEIPT_ATTESTATION);
    expect(res.body.patch_hash).toBeDefined();
    expect(res.body.changed_files).toEqual([
      'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
    ]);
  });

  it('generates a complete Proof Receipt when all checks have explicit evaluated statuses and retains failed/blocked checks visibly', async () => {
    // Save records with 1 passed and 1 failed check (both explicitly evaluated)
    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
      .send({
        records: [
          {
            checkId: 'check-1',
            label: 'Review updated curriculum phrasing',
            command: 'git diff',
            status: 'passed',
            userNotes: 'Reviewed diff wording locally.',
            recordedAt: new Date().toISOString(),
          },
          {
            checkId: 'check-2',
            label: 'Execute local curriculum tests',
            command: 'pnpm run test:curriculum',
            status: 'failed',
            userNotes: 'Local curriculum test failed due to node version mismatch in dev env.',
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200);

    const res = await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/proof-receipt`)
      .send({
        userAttestation: true,
        branchName: 'fix/node-fs-lesson',
      })
      .expect(200);

    // Status is complete because all checks have an evaluated outcome
    expect(res.body.status).toBe('complete');
    // Failed check must remain visible (never omitted or hidden)
    expect(res.body.verification_records).toHaveLength(2);
    expect(res.body.verification_records[1].status).toBe('failed');
    expect(res.body.verification_records[1].userNotes).toContain('node version mismatch');

    // GET endpoint returns the saved receipt
    const getReceiptRes = await request(app)
      .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/proof-receipt`)
      .expect(200);

    expect(getReceiptRes.body.receipt_id).toBe(res.body.receipt_id);
    expect(getReceiptRes.body.status).toBe('complete');
  });

  it('enforces selected-issue authorization and rejects unauthorized issue numbers with 404', async () => {
    await request(app)
      .get(`/api/sessions/${mockSessionId}/issues/999999/proof-receipt`)
      .expect(404);

    await request(app)
      .post(`/api/sessions/${mockSessionId}/issues/999999/proof-receipt`)
      .send({ userAttestation: true })
      .expect(404);
  });

  describe('Final Readiness Backend Contract (Day 5/6)', () => {
    it('returns ready_for_manual_handoff when all verification checks are explicitly passed', async () => {
      // 1. Save all passed records
      await request(app)
        .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
        .send({
          records: [
            {
              checkId: 'check-1',
              label: 'Review updated curriculum phrasing',
              command: 'git diff',
              status: 'passed',
              userNotes: 'Phrase accurately reflects Node fs documentation.',
              recordedAt: new Date().toISOString(),
            },
            {
              checkId: 'check-2',
              label: 'Execute local curriculum tests',
              command: 'pnpm run test:curriculum',
              status: 'passed',
              userNotes: 'Local curriculum tests passed 100%.',
              recordedAt: new Date().toISOString(),
            },
          ],
        })
        .expect(200);

      // 2. Fetch readiness
      const res = await request(app)
        .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/readiness`)
        .expect(200);

      expect(res.body).toEqual({
        selectedIssue: {
          number: mockIssueNumber,
          title: mockIssue.title,
          url: mockIssue.html_url,
        },
        repositoryRelationshipLabel: 'Selected practice repository',
        reviewedSourceCount: 1,
        patchStatus: 'completed',
        verificationSummary: {
          passed: 2,
          failed: 0,
          blocked: 0,
          notRun: 0,
        },
        readinessStatus: 'ready_for_manual_handoff',
      });

      // Privacy guarantee: No session IDs, TTLs, tokens, model/collector names, or debug metadata
      const forbiddenKeys = [
        'session_id',
        'sessionId',
        'ttl',
        'ttl_seconds_remaining',
        'token',
        'collector',
        'model_id',
        'model',
        'api_status',
        'debug',
        'is_fixture',
      ];
      for (const key of forbiddenKeys) {
        expect(res.body).not.toHaveProperty(key);
      }
    });

    it('returns needs_attention when one or more verification checks failed', async () => {
      // Save 1 passed and 1 failed check
      await request(app)
        .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
        .send({
          records: [
            {
              checkId: 'check-1',
              label: 'Review updated curriculum phrasing',
              command: 'git diff',
              status: 'passed',
              userNotes: 'Phrasing confirmed.',
              recordedAt: new Date().toISOString(),
            },
            {
              checkId: 'check-2',
              label: 'Execute local curriculum tests',
              command: 'pnpm run test:curriculum',
              status: 'failed',
              userNotes: 'Node 20 test runner failed with syntax error.',
              recordedAt: new Date().toISOString(),
            },
          ],
        })
        .expect(200);

      const res = await request(app)
        .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/readiness`)
        .expect(200);

      expect(res.body.readinessStatus).toBe('needs_attention');
      expect(res.body.verificationSummary).toEqual({
        passed: 1,
        failed: 1,
        blocked: 0,
        notRun: 0,
      });
    });

    it('returns needs_attention when one or more verification checks are blocked', async () => {
      // Save 1 passed and 1 blocked check
      await request(app)
        .post(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/verification-records`)
        .send({
          records: [
            {
              checkId: 'check-1',
              label: 'Review updated curriculum phrasing',
              command: 'git diff',
              status: 'passed',
              userNotes: 'Phrasing confirmed.',
              recordedAt: new Date().toISOString(),
            },
            {
              checkId: 'check-2',
              label: 'Execute local curriculum tests',
              command: 'pnpm run test:curriculum',
              status: 'blocked',
              userNotes: 'Local pnpm install blocked by corporate proxy.',
              recordedAt: new Date().toISOString(),
            },
          ],
        })
        .expect(200);

      const res = await request(app)
        .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/readiness`)
        .expect(200);

      expect(res.body.readinessStatus).toBe('needs_attention');
      expect(res.body.verificationSummary).toEqual({
        passed: 1,
        failed: 0,
        blocked: 1,
        notRun: 0,
      });
    });

    it('returns needs_attention when checks remain not_run by default', async () => {
      // Create fresh session repository with no human verification records yet saved
      const freshSessionId = '00000000-0000-0000-0000-000000000001';
      await sessionRepo.createSession({
        session_id: freshSessionId,
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'issue_selected',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        discovered_issues: [mockIssue],
      });

      const res = await request(app)
        .get(`/api/sessions/${freshSessionId}/issues/${mockIssueNumber}/readiness`)
        .expect(200);

      expect(res.body.readinessStatus).toBe('needs_attention');
      expect(res.body.verificationSummary.notRun).toBeGreaterThan(0);
      expect(res.body.verificationSummary.passed).toBe(0);
    });

    it('preserves selected_practice_repository relationship label for freeCodeCamp', async () => {
      const res = await request(app)
        .get(`/api/sessions/${mockSessionId}/issues/${mockIssueNumber}/readiness`)
        .expect(200);

      expect(res.body.repositoryRelationshipLabel).toBe('Selected practice repository');
    });
  });
});
