import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManualHandoffCanvas } from '../src/components/ManualHandoffCanvas.js';
import * as api from '../src/api/sessions.js';
import { SessionDocument, NormalizedIssue, VerificationRecord } from '@web-slinger/shared';

describe('Manual Handoff Screen & PR-Draft Preparation', () => {
  const mockSession: SessionDocument = {
    session_id: 'session-handoff-test-1234',
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

  const mockPassedRecords: VerificationRecord[] = [
    {
      checkId: 'format_check',
      label: 'Format check',
      command: 'pnpm run lint',
      status: 'passed',
      userNotes: 'ESLint and prettier passed cleanly.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'targeted_check',
      label: 'Targeted check',
      command: 'pnpm test',
      status: 'passed',
      userNotes: '42 curriculum unit tests passed.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'manual_review',
      label: 'Manual review',
      command: 'git diff',
      status: 'passed',
      userNotes: 'Inspected phrasing in VS Code editor.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'contribution_guide',
      label: 'Contribution guide',
      command: 'git log -n 1',
      status: 'passed',
      userNotes: 'Verified branch and conventional commit format.',
      recordedAt: new Date().toISOString(),
    },
  ];

  const mockNeedsAttentionRecords: VerificationRecord[] = [
    {
      checkId: 'format_check',
      label: 'Format check',
      command: 'pnpm run lint',
      status: 'passed',
      userNotes: 'Lint passed.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'targeted_check',
      label: 'Targeted check',
      command: 'pnpm test',
      status: 'failed',
      userNotes: 'Node 18 vs Node 20 runtime mismatch on local setup.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'manual_review',
      label: 'Manual review',
      command: 'git diff',
      status: 'passed',
      userNotes: 'Verified diff locally.',
      recordedAt: new Date().toISOString(),
    },
    {
      checkId: 'contribution_guide',
      label: 'Contribution guide',
      command: 'git log -n 1',
      status: 'blocked',
      userNotes: 'Need access to upstream contribution checklist.',
      recordedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.spyOn(api, 'getVerificationRecords').mockResolvedValue({
      session_id: 'session-handoff-test-1234',
      issue_number: 69622,
      records: mockPassedRecords,
      updated_at: new Date().toISOString(),
      is_fixture: false,
    });

    vi.spyOn(api, 'getProofReceipt').mockResolvedValue(null as any);
    vi.spyOn(api, 'getPatchDraft').mockResolvedValue({
      patch_id: 'patch-1',
      session_id: 'session-handoff-test-1234',
      issue_number: 69622,
      status: 'completed',
      diff_content: '--- a/file.md\n+++ b/file.md',
      user_affirmation: 'affirmed',
      reviewed_at: new Date().toISOString(),
      reviewed_sources: [],
      changed_files: ['curriculum/challenges/english/lesson.md'],
      total_changed_lines: 4,
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: [],
      warnings: [],
      is_user_edited: false,
      is_fixture: false,
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders required heading and exact mandatory notice', async () => {
    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      // 1. Heading
      expect(
        screen.getByRole('heading', { name: 'You are in control of the final step.' })
      ).toBeInTheDocument();
    });

    // 2. Exact Notice
    expect(
      screen.getByText(
        'Web-Slinger has not pushed your branch or created a pull request. Review the diff, then use your own Git and GitHub account if you decide to share it.'
      )
    ).toBeInTheDocument();
  });

  it('renders concise readiness summary with Selected practice repository label and ready state', async () => {
    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      expect(screen.getByText('READINESS: READY FOR MANUAL HANDOFF')).toBeInTheDocument();
    });

    expect(screen.getByText('Selected practice repository')).toBeInTheDocument();
    expect(screen.getAllByText(/#69622 fs lesson incorrectly states/i)[0]).toBeInTheDocument();
    expect(screen.getByText('Passed: 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy my handoff checklist' })).toBeInTheDocument();
  });

  it('shows exactly which user-recorded check needs attention and does NOT hide failures or call work ready', async () => {
    vi.spyOn(api, 'getVerificationRecords').mockResolvedValue({
      session_id: 'session-handoff-test-1234',
      issue_number: 69622,
      records: mockNeedsAttentionRecords,
      updated_at: new Date().toISOString(),
      is_fixture: false,
    });

    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      expect(screen.getByText('READINESS: NEEDS ATTENTION')).toBeInTheDocument();
    });

    // Does NOT say Ready for manual handoff
    expect(screen.queryByText('READINESS: READY FOR MANUAL HANDOFF')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy my handoff checklist' })).not.toBeInTheDocument();

    // Plainly shows failed and blocked checks
    expect(screen.getByText('Failed: 1')).toBeInTheDocument();
    expect(screen.getByText('Blocked: 1')).toBeInTheDocument();
    expect(screen.getAllByText(/Node 18 vs Node 20 runtime mismatch/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Need access to upstream contribution checklist/i)[0]).toBeInTheDocument();
  });

  it('provides editable PR draft with sections and defaults to "Related to #<issue>" rather than "Closes #<issue>"', async () => {
    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Pull Request Draft' })).toBeInTheDocument();
    });

    const titleInput = screen.getByLabelText(/Pull Request Title/i) as HTMLInputElement;
    expect(titleInput.value).toContain('69622');

    const bodyTextarea = screen.getByLabelText(/Pull Request Description/i) as HTMLTextAreaElement;
    expect(bodyTextarea.value).toContain('## Summary');
    expect(bodyTextarea.value).toContain('## Related issue');
    expect(bodyTextarea.value).toContain('Related to #69622');
    expect(bodyTextarea.value).not.toContain('Closes #69622');
    expect(bodyTextarea.value).toContain('## What I checked');
    expect(bodyTextarea.value).toContain('## Notes for maintainers');

    // Editable
    fireEvent.change(bodyTextarea, {
      target: { value: '## Summary\nUpdated wording.\n\n## Related issue\nRelated to #69622' },
    });
    expect(bodyTextarea.value).toBe('## Summary\nUpdated wording.\n\n## Related issue\nRelated to #69622');
  });

  it('renders all manual Git commands in CodeBlock with simple one-sentence explanations', async () => {
    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Manual Git Commands' })).toBeInTheDocument();
    });

    // Check all 5 manual git commands
    expect(screen.getByText('git status')).toBeInTheDocument();
    expect(screen.getByText('Check the working tree and see modified files in your local branch.')).toBeInTheDocument();

    expect(screen.getByText('git diff --check')).toBeInTheDocument();
    expect(screen.getByText('Inspect the diff and verify there are no whitespace or syntax errors.')).toBeInTheDocument();

    expect(screen.getByText('git add .')).toBeInTheDocument();
    expect(screen.getByText('Stage the reviewed file changes for commit.')).toBeInTheDocument();

    expect(screen.getByText(/git commit -m/i)).toBeInTheDocument();
    expect(screen.getByText('Create a commit with a clear, conventional commit message.')).toBeInTheDocument();

    expect(screen.getByText(/git push -u origin/i)).toBeInTheDocument();
    expect(screen.getByText('Push your local branch to your personal fork on GitHub.')).toBeInTheDocument();
  });

  it('provides Copy commands, Copy PR draft, Open my fork, Open upstream issue, Download proof receipt actions only', async () => {
    render(<ManualHandoffCanvas session={mockSession} issue={mockIssue} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Handoff Actions & External Links' })).toBeInTheDocument();
    });

    // Allowed actions
    expect(screen.getAllByRole('button', { name: 'Copy commands' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy PR draft' })[0]).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my fork' })).toHaveAttribute(
      'href',
      'https://github.com/freeCodeCamp/freeCodeCamp/fork'
    );
    expect(screen.getByRole('link', { name: 'Open upstream issue' })).toHaveAttribute(
      'href',
      'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622'
    );
    expect(screen.getByRole('button', { name: 'Download proof receipt' })).toBeInTheDocument();

    // Test Copy PR draft click
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy PR draft' })[0]);
    await waitFor(() => {
      expect(screen.getByText(/Copied PR draft to clipboard!/i)).toBeInTheDocument();
    });

    // Strictly ensure NO forbidden buttons exist
    const forbiddenPatterns = [
      /^push$/i,
      /^commit$/i,
      /^submit$/i,
      /^auto-submit$/i,
      /^create pull request$/i,
      /^create pr$/i,
      /^open pr$/i,
    ];
    for (const pat of forbiddenPatterns) {
      expect(screen.queryByRole('button', { name: pat })).toBeNull();
    }
  });
});
