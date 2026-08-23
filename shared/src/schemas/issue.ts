import { z } from 'zod';

export const OpportunityTierSchema = z.enum(['A', 'B']);
export type OpportunityTier = z.infer<typeof OpportunityTierSchema>;

export const RepositoryRelationshipSchema = z.enum([
  'verified_company_repository',
  'selected_practice_repository',
  'unrelated_repository',
]);
export type RepositoryRelationship = z.infer<typeof RepositoryRelationshipSchema>;

export const REPOSITORY_RELATIONSHIP_LABELS: Record<RepositoryRelationship, string> = {
  verified_company_repository: 'Verified company repository',
  selected_practice_repository: 'Selected practice repository',
  unrelated_repository: 'Unrelated — not a company contribution path',
};

/**
 * Evaluates repository relationship truthfulness against target company context.
 */
export function determineRepositoryRelationship(
  owner: string,
  repo: string,
  companyName?: string | null
): {
  relationship: RepositoryRelationship;
  label: string;
} {
  const normOwner = (owner || '').toLowerCase().trim();
  const normRepo = (repo || '').toLowerCase().trim();
  const normCompany = (companyName || '').toLowerCase().trim();

  // If owner matches company name or company domain (e.g. oracle/graalvm for Oracle, facebook/react for Meta)
  if (normCompany && (normOwner === normCompany || normRepo.includes(normCompany))) {
    return {
      relationship: 'verified_company_repository',
      label: REPOSITORY_RELATIONSHIP_LABELS.verified_company_repository,
    };
  }

  // freeCodeCamp/freeCodeCamp is specifically a selected practice repository
  if (normOwner === 'freecodecamp' && normRepo === 'freecodecamp') {
    return {
      relationship: 'selected_practice_repository',
      label: REPOSITORY_RELATIONSHIP_LABELS.selected_practice_repository,
    };
  }

  // Fallback for general unverified repos
  return {
    relationship: 'unrelated_repository',
    label: REPOSITORY_RELATIONSHIP_LABELS.unrelated_repository,
  };
}

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
  repository_relationship: RepositoryRelationshipSchema.default('selected_practice_repository'),
  repository_relationship_label: z.string().default('Selected practice repository'),
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
  repository_relationship: RepositoryRelationshipSchema.default('selected_practice_repository'),
  repository_relationship_label: z.string().default('Selected practice repository'),
});
export type GetSessionIssuesResponse = z.infer<typeof GetSessionIssuesResponseSchema>;
