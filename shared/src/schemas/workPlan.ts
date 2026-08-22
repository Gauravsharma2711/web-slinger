import { z } from 'zod';

/**
 * Read-only evidence representing an exact file retrieved from a repository.
 */
export const RepositoryFileEvidenceSchema = z.object({
  path: z.string().min(1),
  ref: z.string().default('main'),
  sha: z.string().min(1),
  htmlUrl: z.string().url(),
  retrievedAt: z.string().datetime(),
  content: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  isTruncated: z.boolean().default(false),
  omittedReason: z.string().optional(),
});
export type RepositoryFileEvidence = z.infer<typeof RepositoryFileEvidenceSchema>;

/**
 * Candidate file identified during source inspection.
 */
export const CandidateFileConfidenceSchema = z.enum(['confirmed', 'candidate']);
export type CandidateFileConfidence = z.infer<typeof CandidateFileConfidenceSchema>;

export const CandidateFileSchema = z.object({
  path: z.string().min(1),
  confidence: CandidateFileConfidenceSchema,
  rationale: z.string().min(1),
  evidenceUrls: z.array(z.string().url()).default([]),
});
export type CandidateFile = z.infer<typeof CandidateFileSchema>;

/**
 * Details of a file whose source content was reviewed.
 */
export const ReviewedFileSchema = z.object({
  path: z.string().min(1),
  sha: z.string().min(1),
  summary: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type ReviewedFile = z.infer<typeof ReviewedFileSchema>;

/**
 * Source citation in the contribution work plan.
 */
export const WorkPlanCitationItemSchema = z.object({
  claim: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type WorkPlanCitationItem = z.infer<typeof WorkPlanCitationItemSchema>;

/**
 * Core generative content schema for the contribution work plan.
 */
export const ContributionWorkPlanContentSchema = z.object({
  confirmedProblem: z.string().min(1),
  candidateFiles: z.array(CandidateFileSchema).min(1),
  reviewedFiles: z.array(ReviewedFileSchema).default([]),
  smallestChangePlan: z.array(z.string().min(1)).min(1),
  risksAndUnknowns: z.array(z.string().min(1)).default([]),
  manualVerificationPlan: z.array(z.string().min(1)).min(1),
  sourceCitations: z.array(WorkPlanCitationItemSchema).min(1),
});
export type ContributionWorkPlanContent = z.infer<typeof ContributionWorkPlanContentSchema>;

/**
 * Status of the work plan generation and validation.
 */
export const ContributionWorkPlanStatusSchema = z.enum(['completed', 'needs_review', 'failed']);
export type ContributionWorkPlanStatus = z.infer<typeof ContributionWorkPlanStatusSchema>;

/**
 * Firestore document schema stored in sessions/{sessionId}/work_plans/{issueNumber}.
 */
export const ContributionWorkPlanDocumentSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: ContributionWorkPlanStatusSchema,
  plan: ContributionWorkPlanContentSchema.nullable().optional(),
  file_evidence: z.array(RepositoryFileEvidenceSchema).default([]),
  model_id: z.string().default('gemini-3.7-flash'),
  source_pack_version: z.string().default('1.0'),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()).default([]),
  is_fixture: z.boolean().default(false),
});
export type ContributionWorkPlanDocument = z.infer<typeof ContributionWorkPlanDocumentSchema>;

/**
 * API Response schema for POST & GET /api/sessions/:sessionId/issues/:issueNumber/work-plan.
 */
export const WorkPlanResponseSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: ContributionWorkPlanStatusSchema,
  plan: ContributionWorkPlanContentSchema.nullable().optional(),
  file_evidence: z.array(RepositoryFileEvidenceSchema).default([]),
  model_id: z.string(),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()).default([]),
  is_fixture: z.boolean().default(false),
  message: z.string().optional(),
});
export type WorkPlanResponse = z.infer<typeof WorkPlanResponseSchema>;
