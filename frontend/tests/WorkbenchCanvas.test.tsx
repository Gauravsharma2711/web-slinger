import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkbenchCanvas } from '../src/components/WorkbenchCanvas.js';
import * as api from '../src/api/sessions.js';
import {
  SessionDocument,
  NormalizedIssue,
  WorkPlanResponse,
  PatchDraftResponse,
  VerificationPlanResponse,
  VerificationRecordsResponse,
  ProofReceiptResponse,
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_RECEIPT_ATTESTATION,
} from '@web-slinger/shared';

describe('WorkbenchCanvas Component & Flow', () => {
  const mockSession: SessionDocument = {
    session_id: 'session-wb-test-1234',
    stack: ['TypeScript', 'React'],
    normalized_stack: ['typescript', 'react'],
    goal: null,
    stage: 'issue_selected',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    current_job_id: 'job-1',
    snapshot_id: 'snap-1',
    health: {
      status: 'healthy',
      message: 'Active',
      timestamp: new Date().toISOString(),
    },
  };

  const mockIssue: NormalizedIssue = {
    id: 69622,
    number: 69622,
    title: 'fs lesson incorrectly states that every method has a synchronous version',
    body: 'In the Node.js core modules lesson...',
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
    repository_relationship: 'selected_practice_repository',
    repository_relationship_label: 'Selected practice repository',
  };

  const mockWorkPlan: WorkPlanResponse = {
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    status: 'completed',
    plan: {
      confirmedProblem: 'The fs module lesson inaccurately claims all methods have synchronous variants.',
      candidateFiles: [
        {
          path: 'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
          confidence: 'confirmed',
          rationale: 'Contains the exact lesson sentence mentioned in the issue description.',
          evidenceUrls: [
            'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
          ],
        },
        {
          path: 'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/quiz.md',
          confidence: 'candidate',
          rationale: 'Quiz questions covering fs module methods.',
          evidenceUrls: [],
        },
      ],
      reviewedFiles: [],
      smallestChangePlan: [
        'Open curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
        'Update phrasing from "every method" to "most methods or common file operations"',
        'Preview markdown formatting locally',
      ],
      risksAndUnknowns: ['Check if other language curriculum translations need parallel updates.'],
      manualVerificationPlan: [
        'Run `pnpm run test:curriculum` locally.',
        'Preview lecture page in dev server.',
      ],
      sourceCitations: [
        {
          claim: 'Lesson inaccuracy regarding fs methods',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        },
      ],
    },
    file_evidence: [
      {
        path: 'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
        ref: 'main',
        sha: 'abc1234567890',
        htmlUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
        sizeBytes: 1200,
        retrievedAt: new Date().toISOString(),
        content: '# Node fs Module\nAlmost every method in the fs module has a synchronous version.',
        isTruncated: false,
      },
    ],
    model_id: 'gemini-3.7-flash',
    validation_errors: [],
    generated_at: new Date().toISOString(),
    is_fixture: false,
  };

  const mockPatchDraft: PatchDraftResponse = {
    patch_id: 'patch-draft-1234',
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    status: 'completed',
    diff_content: `--- a/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md\n+++ b/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md\n@@ -10,3 +10,3 @@\n-Almost every method in the fs module has a synchronous version.\n+Most common methods in the fs module have synchronous versions.`,
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

  const mockVerificationPlan: VerificationPlanResponse = {
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    plan: {
      checklist: [
        {
          id: 'check-diff',
          title: 'Review updated curriculum phrasing',
          description: 'Ensure accurate description of Node fs module methods.',
          suggestedCommand: 'git diff',
          status: 'not_verified',
        },
        {
          id: 'check-test',
          title: 'Execute local curriculum tests',
          description: 'Verify markdown structure passes test suite.',
          suggestedCommand: 'pnpm run test:curriculum',
          status: 'not_verified',
        },
      ],
      disclaimer: 'All checks must be performed manually by the developer.',
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

  const mockVerificationRecords: VerificationRecordsResponse = {
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    records: [
      {
        checkId: 'check-diff',
        label: 'Review updated curriculum phrasing',
        command: 'git diff',
        status: 'not_run',
        userNotes: '',
        recordedAt: new Date().toISOString(),
      },
      {
        checkId: 'check-test',
        label: 'Execute local curriculum tests',
        command: 'pnpm run test:curriculum',
        status: 'not_run',
        userNotes: '',
        recordedAt: new Date().toISOString(),
      },
    ],
    updated_at: new Date().toISOString(),
    is_fixture: false,
  };

  const mockProofReceipt: ProofReceiptResponse = {
    receipt_id: 'receipt-uuid-12345678',
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    repository: 'freeCodeCamp/freeCodeCamp',
    branch_name: 'fix/node-fs-lesson',
    patch_id: 'patch-draft-1234',
    patch_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    changed_files: [
      'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
    ],
    total_changed_lines: 2,
    source_urls: [
      'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
      'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
    ],
    issue_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
    verification_records: [
      {
        checkId: 'check-diff',
        label: 'Review updated curriculum phrasing',
        command: 'git diff',
        status: 'passed',
        userNotes: 'Inspected phrasing in local VS Code.',
        evidenceReference: 'Exit 0',
        recordedAt: new Date().toISOString(),
      },
      {
        checkId: 'check-test',
        label: 'Execute local curriculum tests',
        command: 'pnpm run test:curriculum',
        status: 'failed',
        userNotes: 'Node 18 vs Node 20 mismatch on local dev setup.',
        evidenceReference: 'pnpm test exit 1',
        recordedAt: new Date().toISOString(),
      },
    ],
    user_attestation: MANDATORY_RECEIPT_ATTESTATION,
    status: 'complete',
    created_at: new Date().toISOString(),
    is_fixture: false,
  };

  beforeEach(() => {
    vi.spyOn(api, 'getWorkPlan').mockResolvedValue(mockWorkPlan);
    vi.spyOn(api, 'generateWorkPlan').mockResolvedValue(mockWorkPlan);
    vi.spyOn(api, 'generatePatchDraft').mockResolvedValue(mockPatchDraft);
    vi.spyOn(api, 'updatePatchDraft').mockResolvedValue(mockPatchDraft);
    vi.spyOn(api, 'generateVerificationPlan').mockResolvedValue(mockVerificationPlan);
    vi.spyOn(api, 'getVerificationRecords').mockResolvedValue(mockVerificationRecords);
    vi.spyOn(api, 'saveVerificationRecords').mockImplementation(async (_, __, records) => ({
      session_id: 'session-wb-test-1234',
      issue_number: 69622,
      records,
      updated_at: new Date().toISOString(),
      is_fixture: false,
    }));
    vi.spyOn(api, 'createProofReceipt').mockResolvedValue(mockProofReceipt);
    vi.spyOn(api, 'getProofReceipt').mockResolvedValue(mockProofReceipt);

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Step 1: Work Plan with all required sections and confirmed/candidate badges', async () => {
    render(
      <WorkbenchCanvas
        session={mockSession}
        issue={mockIssue}
        initialStep="plan"
        onBackToBrief={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('1. Confirmed Problem')).toBeDefined();
    });

    expect(screen.getByText(mockWorkPlan.plan!.confirmedProblem)).toBeDefined();
    expect(screen.getByText('Strong first option')).toBeDefined();
    expect(screen.getByText('Needs more reading')).toBeDefined();
    expect(screen.getByText('3. Smallest Change Plan')).toBeDefined();
    expect(screen.getByText('4. Risks & Unknowns to Verify')).toBeDefined();
    expect(screen.getByText('5. Recommended Manual Checks')).toBeDefined();
    expect(screen.getByText('6. Source Evidence Grounding')).toBeDefined();
  });

  it('renders Step 2: Source Review and keeps patch generation gated until all sources and affirmation are checked', async () => {
    render(
      <WorkbenchCanvas
        session={mockSession}
        issue={mockIssue}
        initialStep="sources"
        onBackToBrief={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Have you verified the source files before drafting?')).toBeDefined();
    });

    const generateBtn = screen.getByRole('button', { name: /Generate patch draft/i });
    expect(generateBtn.hasAttribute('disabled')).toBe(true);

    const sourceCheckbox = await screen.findByLabelText(/curriculum\/challenges\/english/i);
    fireEvent.click(sourceCheckbox);

    // Button should still be disabled until affirmation is checked
    expect(generateBtn.hasAttribute('disabled')).toBe(true);

    // Check mandatory affirmation checkbox
    const affirmationCheckbox = screen.getByLabelText(
      new RegExp(MANDATORY_USER_AFFIRMATION, 'i')
    );
    fireEvent.click(affirmationCheckbox);

    // Now button should be enabled
    expect(generateBtn.hasAttribute('disabled')).toBe(false);

    // Click generate patch
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(api.generatePatchDraft).toHaveBeenCalledTimes(1);
    });
  });

  it('renders Step 3: Patch Review with persistent notice, editable diff, and zero forbidden buttons', async () => {
    const { container } = render(
      <WorkbenchCanvas
        session={mockSession}
        issue={mockIssue}
        initialStep="sources"
        onBackToBrief={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Have you verified the source files before drafting?')).toBeDefined();
    });

    const sourceCheckbox = await screen.findByLabelText(/curriculum\/challenges\/english/i);
    fireEvent.click(sourceCheckbox);
    fireEvent.click(screen.getByLabelText(new RegExp(MANDATORY_USER_AFFIRMATION, 'i')));
    fireEvent.click(screen.getByRole('button', { name: /Generate patch draft/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Draft only\. Web-Slinger has not modified a repository or run these changes\./i
        )
      ).toBeDefined();
    });

    // Check changed lines
    expect(container.textContent).toContain('1 changed file');
    expect(container.textContent).toContain('2 changed lines');

    // Editable diff textarea
    const textarea = screen.getByLabelText(/Editable unified diff/i);
    expect(textarea).toBeDefined();

    // Action buttons
    expect(screen.getByRole('button', { name: /Save my edited draft/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Copy patch/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Download \.patch/i })).toBeDefined();

    // Strictly verify ZERO forbidden buttons
    const forbiddenButtonNames = [
      /^apply$/i,
      /^fix$/i,
      /^push$/i,
      /^commit$/i,
      /^submit$/i,
      /create pull request/i,
    ];
    for (const forbidden of forbiddenButtonNames) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
    }
  });

  it('renders Step 4: Verification Evidence with prominent notice, default not_run statuses, and human notes input', async () => {
    render(
      <WorkbenchCanvas
        session={mockSession}
        issue={mockIssue}
        initialStep="plan"
        onBackToBrief={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('1. Confirmed Problem')).toBeDefined();
    });

    // Navigate to step 4
    const step4Tab = screen.getByRole('button', { name: /4.*Verification/i });
    fireEvent.click(step4Tab);

    await waitFor(() => {
      // Exact mandatory notice check (Requirement 3)
      expect(
        screen.getByText(
          'Web-Slinger cannot run commands in your local repository. Record only results you personally observed.'
        )
      ).toBeDefined();
    });

    // Verify checklist items loaded
    await waitFor(() => {
      expect(screen.getAllByText('Review updated curriculum phrasing')[0]).toBeDefined();
      expect(screen.getAllByText('Execute local curriculum tests')[0]).toBeDefined();
    });

    // Change status of first check to Passed
    const passedBtn = screen.getAllByRole('button', { name: /✓ Passed/i })[0];
    fireEvent.click(passedBtn);

    // Enter user note (wait for textarea to render or match by label/id)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Describe your observation/i)).toBeDefined();
    });
    const notesInput = screen.getByPlaceholderText(/Describe your observation/i);
    fireEvent.change(notesInput, {
      target: { value: 'Verified wording matches Node 20 documentation.' },
    });

    // Save verification records
    const saveBtn = screen.getByRole('button', { name: /Save verification records/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.saveVerificationRecords).toHaveBeenCalledTimes(1);
    });
  });

  it('renders Step 5: Proof Receipt with attestation gate, failed/blocked checks visible, and copy/download actions only', async () => {
    // Start directly at Step 5
    vi.spyOn(api, 'getProofReceipt').mockResolvedValue(mockProofReceipt);

    render(
      <WorkbenchCanvas
        session={mockSession}
        issue={mockIssue}
        initialStep="receipt"
        onBackToBrief={vi.fn()}
        onReset={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/RECEIPT STATUS: COMPLETE/i)).toBeDefined();
    });

    // Verify Proof Receipt metadata
    expect(screen.getAllByText('freeCodeCamp/freeCodeCamp')[0]).toBeDefined();
    expect(screen.getByText(/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08/i)).toBeDefined();
    expect(screen.getByText(new RegExp(MANDATORY_RECEIPT_ATTESTATION, 'i'))).toBeDefined();

    // Verify failed check remains 100% visible
    expect(screen.getAllByText('FAILED')[0]).toBeDefined();
    expect(screen.getAllByText(/Node 18 vs Node 20 mismatch/i)[0]).toBeDefined();

    // Verify Copy & Download actions
    expect(screen.getByRole('button', { name: /Copy receipt \(JSON\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Copy receipt \(Markdown\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Download receipt \(\.json\)/i })).toBeDefined();

    // Verify ZERO forbidden action buttons
    const forbiddenButtonNames = [
      /^apply$/i,
      /^fix$/i,
      /^push$/i,
      /^commit$/i,
      /^submit$/i,
      /create pull request/i,
    ];
    for (const forbidden of forbiddenButtonNames) {
      expect(screen.queryByRole('button', { name: forbidden })).toBeNull();
    }
  });
});
