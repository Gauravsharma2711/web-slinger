import { describe, it, expect } from 'vitest';
import {
  OpportunityTierSchema,
  GitHubIssueSourceSchema,
  NormalizedIssueSchema,
  GitHubResearchStatusSchema,
  GetSessionIssuesResponseSchema,
} from '../src/schemas/issue.js';

describe('Shared GitHub Issue Schemas', () => {
  it('validates OpportunityTier enum values A and B', () => {
    expect(OpportunityTierSchema.safeParse('A').success).toBe(true);
    expect(OpportunityTierSchema.safeParse('B').success).toBe(true);
    expect(OpportunityTierSchema.safeParse('C').success).toBe(false);
  });

  it('validates GitHubIssueSource schema', () => {
    const validSource = {
      owner: 'facebook',
      repo: 'react',
      issue_number: 101,
      html_url: 'https://github.com/facebook/react/issues/101',
      retrieved_at: new Date().toISOString(),
    };
    expect(GitHubIssueSourceSchema.safeParse(validSource).success).toBe(true);
  });

  it('validates NormalizedIssue schema with both populated and nullable body, score, and reasons', () => {
    const issueWithBody = {
      id: 12345,
      number: 101,
      title: 'Fix hydration mismatch warning',
      body: 'Detailed issue description with reproduction steps.',
      html_url: 'https://github.com/facebook/react/issues/101',
      state: 'open',
      labels: ['bug', 'help wanted'],
      assignees: ['gaearon'],
      author: 'contributor1',
      comments_count: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_url: 'https://github.com/facebook/react/issues/101',
      retrieved_at: new Date().toISOString(),
      tier: 'A',
      score: 85,
      reasons: [
        'Matched onboarding label: "help wanted"',
        'Detailed issue description with reproduction steps.',
      ],
      is_fixture: false,
    };

    const issueWithNullBody = {
      ...issueWithBody,
      body: null,
      tier: 'B',
      score: 25,
      reasons: ['No body provided', 'Assigned to existing contributor'],
      is_fixture: true,
    };

    expect(NormalizedIssueSchema.safeParse(issueWithBody).success).toBe(true);
    expect(NormalizedIssueSchema.safeParse(issueWithNullBody).success).toBe(true);
  });

  it('validates GitHubResearchStatusSchema values', () => {
    const validStatuses = [
      'idle',
      'fetching',
      'completed',
      'cached',
      'rate_limited',
      'not_found',
      'degraded',
      'failed',
    ];
    for (const status of validStatuses) {
      expect(GitHubResearchStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(GitHubResearchStatusSchema.safeParse('invalid_status').success).toBe(false);
  });

  it('validates GetSessionIssuesResponse schema', () => {
    const response = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      owner: 'facebook',
      repo: 'react',
      status: 'completed',
      message: 'Successfully discovered 1 open issues',
      issues: [
        {
          id: 12345,
          number: 101,
          title: 'Fix hydration mismatch warning',
          body: 'Detailed issue description',
          html_url: 'https://github.com/facebook/react/issues/101',
          state: 'open',
          labels: ['bug'],
          assignees: [],
          author: 'user1',
          comments_count: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_url: 'https://github.com/facebook/react/issues/101',
          retrieved_at: new Date().toISOString(),
          tier: 'A',
          score: 80,
          reasons: ['Valid issue description'],
          is_fixture: false,
        },
      ],
      total_count: 1,
      cached: false,
      rate_limit_remaining: 59,
      rate_limit_reset: 1700000000,
      is_fixture: false,
    };

    expect(GetSessionIssuesResponseSchema.safeParse(response).success).toBe(true);
  });
});
