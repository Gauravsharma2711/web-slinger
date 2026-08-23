import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VerifyCanvas } from '../src/components/VerifyCanvas.js';
import * as api from '../src/api/sessions.js';
import { SessionDocument, NormalizedIssue } from '@web-slinger/shared';

describe('Simplified VerifyCanvas Component & Verification Flow', () => {
  const mockSession: SessionDocument = {
    session_id: 'session-verify-test-1234',
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

  beforeEach(() => {
    vi.spyOn(api, 'getVerificationRecords').mockResolvedValue({
      session_id: 'session-verify-test-1234',
      issue_number: 69622,
      records: [],
      updated_at: new Date().toISOString(),
      is_fixture: false,
    });

    vi.spyOn(api, 'saveVerificationRecords').mockImplementation(async (_, __, records) => ({
      session_id: 'session-verify-test-1234',
      issue_number: 69622,
      records,
      updated_at: new Date().toISOString(),
      is_fixture: false,
    }));

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders required heading, supporting text, and compact selected-issue panel', () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    // 1. Heading
    expect(screen.getByRole('heading', { name: 'Check your work before you share it.' })).toBeInTheDocument();

    // 2. Supporting text
    expect(
      screen.getByText(
        'Web-Slinger did not run these checks. Record only what you saw in your own workspace.'
      )
    ).toBeInTheDocument();

    // 3. Compact selected-issue panel
    expect(screen.getByText('Selected practice repository')).toBeInTheDocument();
    expect(
      screen.getByText('#69622 fs lesson incorrectly states that every method has a synchronous version')
    ).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: /Open issue #69622 on GitHub/i });
    expect(sourceLink).toHaveAttribute('href', 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622');

    // 4. Strictly NO session ID, TTL, or dashboard metrics
    expect(screen.queryByText(/session-verify-test-1234/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/24H TTL/i)).not.toBeInTheDocument();
  });

  it('renders exactly four user-facing verification rows with Passed, Failed, Blocked, Not run, and hidden CodeBlock details', () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    // Exactly 4 user-facing verification rows
    expect(screen.getByText('Format check')).toBeInTheDocument();
    expect(screen.getByText('Targeted check')).toBeInTheDocument();
    expect(screen.getByText('Manual review')).toBeInTheDocument();
    expect(screen.getByText('Contribution guide')).toBeInTheDocument();

    // Verify 4 rows present via testids
    expect(screen.getByTestId('verify-row-format_check')).toBeInTheDocument();
    expect(screen.getByTestId('verify-row-targeted_check')).toBeInTheDocument();
    expect(screen.getByTestId('verify-row-manual_review')).toBeInTheDocument();
    expect(screen.getByTestId('verify-row-contribution_guide')).toBeInTheDocument();

    // Verify hidden CodeBlock details area
    const detailsSummaries = screen.getAllByText('Suggested Command & Details');
    expect(detailsSummaries).toHaveLength(4);
  });

  it('disables "Prepare my manual handoff" until all four rows have explicit statuses', async () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    const primaryAction = screen.getByRole('button', { name: 'Prepare my manual handoff' });
    expect(primaryAction).toBeDisabled();
    expect(screen.getByText(/Complete all 4 verification rows/i)).toBeInTheDocument();

    // Set row 1: Format check -> Passed
    const formatCard = screen.getByTestId('verify-row-format_check');
    fireEvent.click(withinRow(formatCard, '✓ Passed'));
    expect(primaryAction).toBeDisabled();

    // Set row 2: Targeted check -> Passed
    const targetedCard = screen.getByTestId('verify-row-targeted_check');
    fireEvent.click(withinRow(targetedCard, '✓ Passed'));
    expect(primaryAction).toBeDisabled();

    // Set row 3: Manual review -> Failed
    const manualCard = screen.getByTestId('verify-row-manual_review');
    fireEvent.click(withinRow(manualCard, '✕ Failed'));
    expect(primaryAction).toBeDisabled();

    // Set row 4: Contribution guide -> Blocked
    const guideCard = screen.getByTestId('verify-row-contribution_guide');
    fireEvent.click(withinRow(guideCard, '⚠ Blocked'));

    // Now all 4 rows have explicit statuses: button should be enabled!
    expect(primaryAction).not.toBeDisabled();
  });

  it('explains failed and blocked states plainly and keeps them visible', () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    // Initially no warning notice
    expect(screen.queryByText(/Notice:.*marked as Failed/i)).not.toBeInTheDocument();

    // Set targeted check to Failed
    const targetedCard = screen.getByTestId('verify-row-targeted_check');
    fireEvent.click(withinRow(targetedCard, '✕ Failed'));

    // Set contribution guide to Blocked
    const guideCard = screen.getByTestId('verify-row-contribution_guide');
    fireEvent.click(withinRow(guideCard, '⚠ Blocked'));

    // Plain notice banner is visible
    expect(screen.getByText(/1 check\(s\) marked as Failed and 1 check\(s\) marked as Blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/Web-Slinger keeps all failed and blocked observations clearly visible/i)).toBeInTheDocument();

    // Plain callouts within individual rows
    expect(screen.getByText(/Marked as Failed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Marked as Blocked:/i)).toBeInTheDocument();
  });

  it('updates Evidence Trail with real saved sources and user-recorded checks', () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    // Initial Evidence Trail has issue and guide
    expect(screen.getByText('Verified Evidence Trail')).toBeInTheDocument();
    expect(screen.getByText('Issue #69622')).toBeInTheDocument();
    expect(screen.getByText('Contribution Guide')).toBeInTheDocument();

    // Mark Format check as Passed and add note
    const formatCard = screen.getByTestId('verify-row-format_check');
    fireEvent.click(withinRow(formatCard, '✓ Passed'));
    const noteInput = formatCard.querySelector('textarea')!;
    fireEvent.change(noteInput, { target: { value: 'Prettier and ESLint passed cleanly with exit code 0.' } });

    // Evidence trail now includes the user-recorded check
    const trailRegion = screen.getByRole('region', { name: 'Evidence trail' });
    expect(trailRegion).toHaveTextContent('Format check: PASSED');
    expect(trailRegion).toHaveTextContent('Prettier and ESLint passed cleanly with exit code 0.');
  });

  it('saves verification records and presents manual handoff package without forbidden buttons', async () => {
    render(<VerifyCanvas session={mockSession} issue={mockIssue} />);

    // Complete all 4 rows
    fireEvent.click(withinRow(screen.getByTestId('verify-row-format_check'), '✓ Passed'));
    fireEvent.click(withinRow(screen.getByTestId('verify-row-targeted_check'), '✓ Passed'));
    fireEvent.click(withinRow(screen.getByTestId('verify-row-manual_review'), '✓ Passed'));
    fireEvent.click(withinRow(screen.getByTestId('verify-row-contribution_guide'), '✓ Passed'));

    const prepareBtn = screen.getByRole('button', { name: 'Prepare my manual handoff' });
    fireEvent.click(prepareBtn);

    await waitFor(() => {
      expect(api.saveVerificationRecords).toHaveBeenCalledTimes(1);
    });

    // Verify manual handoff view appears
    await waitFor(() => {
      expect(screen.getByText(/READINESS: READY FOR MANUAL HANDOFF/i)).toBeInTheDocument();
    });
    expect(screen.getByText('You are in control of the final step.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy my handoff checklist/i })).toBeInTheDocument();

    // Strictly ensure NO forbidden buttons exist
    const forbiddenPatterns = [
      /^push$/i,
      /^submit$/i,
      /^commit$/i,
      /^apply$/i,
      /^create pull request$/i,
      /^create pr$/i,
      /^open pr$/i,
    ];
    for (const pat of forbiddenPatterns) {
      expect(screen.queryByRole('button', { name: pat })).toBeNull();
    }
  });
});

// Helper to find button within row
function withinRow(rowElement: HTMLElement, buttonText: string): HTMLElement {
  const btn = Array.from(rowElement.querySelectorAll('button')).find((b) =>
    b.textContent?.trim().includes(buttonText)
  );
  if (!btn) {
    throw new Error(`Button with text "${buttonText}" not found in row`);
  }
  return btn;
}
