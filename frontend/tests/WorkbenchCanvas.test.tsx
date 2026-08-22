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
  MANDATORY_USER_AFFIRMATION,
  MANDATORY_VERIFICATION_DISCLAIMER,
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
        retrievedAt: new Date().toISOString(),
        content: '# Working with Node Core Modules\n\nThe fs module...',
        sizeBytes: 250,
        isTruncated: false,
      },
    ],
    is_fixture: false,
    generated_at: new Date().toISOString(),
    model_id: 'gemini-3.7-flash',
    validation_errors: [],
  };

  const mockPatchDraft: PatchDraftResponse = {
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
    patch_id: '49a4ad26-6eee-4e59-a448-9eca4d8c5894',
    status: 'completed',
    diff_content: `--- a/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md
+++ b/curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md
@@ -10,3 +10,3 @@
-Almost every method in the fs module has a synchronous version.
+Most common methods in the fs module have synchronous versions.`,
    changed_files: [
      'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
    ],
    total_changed_lines: 2,
    reviewed_sources: [
      {
        path: 'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
        sha: 'abc1234567890',
      },
    ],
    user_affirmation: MANDATORY_USER_AFFIRMATION,
    reviewed_at: new Date().toISOString(),
    is_user_edited: false,
    generated_at: new Date().toISOString(),
    model_id: 'gemini-3.7-flash',
    warnings: [],
    validation_errors: [],
    is_fixture: false,
  };

  const mockVerificationPlan: VerificationPlanResponse = {
    session_id: 'session-wb-test-1234',
    issue_number: 69622,
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

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getWorkPlan').mockResolvedValue(mockWorkPlan);
    vi.spyOn(api, 'generateWorkPlan').mockResolvedValue(mockWorkPlan);
    vi.spyOn(api, 'generatePatchDraft').mockResolvedValue(mockPatchDraft);
    vi.spyOn(api, 'updatePatchDraft').mockResolvedValue({
      ...mockPatchDraft,
      is_user_edited: true,
    });
    vi.spyOn(api, 'generateVerificationPlan').mockResolvedValue(mockVerificationPlan);

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    // Wait for work plan to load
    await waitFor(() => {
      expect(screen.getByText('1. Confirmed Problem')).toBeDefined();
    });

    expect(screen.getByText(mockWorkPlan.plan!.confirmedProblem)).toBeDefined();
    expect(screen.getByText('CONFIRMED')).toBeDefined();
    expect(screen.getByText('CANDIDATE')).toBeDefined();
    expect(screen.getByText('3. Smallest Change Plan')).toBeDefined();
    expect(screen.getByText('4. Risks & Unknowns to Verify')).toBeDefined();
    expect(screen.getByText('5. Recommended Manual Checks')).toBeDefined();
    expect(screen.getByText('6. Source Citations')).toBeDefined();
    expect(screen.getByRole('button', { name: /Proceed to source review/i })).toBeDefined();
  });

  it('enforces human affirmation & source review gate before enabling patch generation in Step 2', async () => {
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
      expect(screen.getByText('Human-in-the-Loop Source Verification')).toBeDefined();
    });

    const generateBtn = screen.getByRole('button', { name: /Generate patch draft/i });
    // Button must be disabled initially
    expect(generateBtn.hasAttribute('disabled')).toBe(true);

    // Wait for and check source file checkbox
    const sourceCheckbox = await screen.findByLabelText(/curriculum\/challenges\/english/i);
    fireEvent.click(sourceCheckbox);

    // Still disabled without affirmation
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

  it('renders Step 3: Patch Review with persistent notice, editable diff, counts, and zero forbidden buttons', async () => {
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
      expect(screen.getByText('Human-in-the-Loop Source Verification')).toBeDefined();
    });

    // Wait for source checkbox to be rendered
    const sourceCheckbox = await screen.findByLabelText(/curriculum\/challenges\/english/i);
    fireEvent.click(sourceCheckbox);
    fireEvent.click(screen.getByLabelText(new RegExp(MANDATORY_USER_AFFIRMATION, 'i')));
    fireEvent.click(screen.getByRole('button', { name: /Generate patch draft/i }));

    await waitFor(() => {
      // Exact mandatory notice check
      expect(
        screen.getByText(
          'Draft only. Web-Slinger has not modified a repository or run these changes. Read, edit, apply, and test the draft in your own local clone.'
        )
      ).toBeDefined();
    });

    // Changed file and line counts
    const patchCounts = container.querySelector('.ws-patch-counts');
    expect(patchCounts).toBeDefined();
    expect(patchCounts?.textContent).toContain('1 changed file');
    expect(patchCounts?.textContent).toContain('2 changed lines');

    // Editable diff textarea
    const textarea = screen.getByLabelText(/Editable unified diff text/i);
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

  it('renders Step 4: Verification Prep with all items badged Not verified and copy checklist action', async () => {
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
    const step4Tab = screen.getByRole('button', { name: /4.*Verification Prep/i });
    fireEvent.click(step4Tab);

    await waitFor(() => {
      expect(screen.getByText(MANDATORY_VERIFICATION_DISCLAIMER)).toBeDefined();
    });

    // All items badged NOT VERIFIED
    const notVerifiedBadges = screen.getAllByText('NOT VERIFIED');
    expect(notVerifiedBadges.length).toBe(2);

    // Copy checklist button
    const copyBtn = screen.getByRole('button', { name: /Copy checklist/i });
    expect(copyBtn).toBeDefined();
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
