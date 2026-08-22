import { z } from 'zod';

export const OpportunityTierSchema = z.enum(['A', 'B']);
export type OpportunityTier = z.infer<typeof OpportunityTierSchema>;

export const GitHubIssueSourceSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issue_number: z.number().int().positive(),
  html_url: z.string().url(),
  retrieved_at: z.string().datetime(),
});
export type GitHubIssueSource = z.infer<typeof GitHubIssueSourceSchema>;

export const NormalizedIssueSchema = z.object({
  id: z.number(),
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string().url(),
  state: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  author: z.string().nullable(),
  comments_count: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  source_url: z.string().url(),
  retrieved_at: z.string().datetime(),
  tier: OpportunityTierSchema.default('B'),
  score: z.number().min(0).max(100).default(0),
  reasons: z.array(z.string()).min(1).default(['Standard open issue']),
  is_fixture: z.boolean().default(false),
});
export type NormalizedIssue = z.infer<typeof NormalizedIssueSchema>;

export const GitHubResearchStatusSchema = z.enum([
  'idle',
  'fetching',
  'completed',
  'cached',
  'rate_limited',
  'not_found',
  'degraded',
  'failed',
]);
export type GitHubResearchStatus = z.infer<typeof GitHubResearchStatusSchema>;

export const GetSessionIssuesResponseSchema = z.object({
  session_id: z.string().uuid(),
  owner: z.string(),
  repo: z.string(),
  status: GitHubResearchStatusSchema,
  message: z.string(),
  issues: z.array(NormalizedIssueSchema),
  total_count: z.number().int().nonnegative(),
  cached: z.boolean().default(false),
  rate_limit_remaining: z.number().int().nullable().optional(),
  rate_limit_reset: z.number().int().nullable().optional(),
  is_fixture: z.boolean().default(false),
});
export type GetSessionIssuesResponse = z.infer<typeof GetSessionIssuesResponseSchema>;
