import { z } from 'zod';

export const TierSchema = z.enum(['tier_a', 'tier_b']);
export type Tier = z.infer<typeof TierSchema>;

export const SourceCitationSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  excerpt: z.string(),
  retrieved_at: z.string().datetime(),
  relevance_reason: z.string().optional(),
});
export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const CompanyOpportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  organization: z.string(),
  match_reason: z.string(),
  source_urls: z.array(z.string().url()),
});
export type CompanyOpportunity = z.infer<typeof CompanyOpportunitySchema>;

export const GitHubIssueSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  repository: z.string(),
  tier: TierSchema,
});
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const ContextBriefSchema = z.object({
  issue_id: z.string(),
  summary: z.string(),
  likely_files: z.array(z.string()),
  citations: z.array(SourceCitationSchema),
  is_partial: z.boolean(),
});
export type ContextBrief = z.infer<typeof ContextBriefSchema>;

export const VerificationGateSchema = z.object({
  source_acknowledged: z.boolean(),
  review_acknowledged: z.boolean(),
  impact_acknowledged: z.boolean(),
  user_edited: z.boolean(),
});
export type VerificationGate = z.infer<typeof VerificationGateSchema>;

export const ProofReceiptSchema = z.object({
  id: z.string(),
  session_id: z.string().uuid(),
  created_at: z.string().datetime(),
  sources: z.array(SourceCitationSchema),
  edit_summary: z.string(),
  verification_statement: z.string(),
  export_type: z.enum(['patch', 'draft_pr']),
});
export type ProofReceipt = z.infer<typeof ProofReceiptSchema>;
