import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'degraded',
  'failed',
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobTypeSchema = z.enum([
  'research',
  'issues',
  'context',
  'proposal',
  'proof',
]);

export type JobType = z.infer<typeof JobTypeSchema>;

export const NormalizedJobResultSchema = z.object({
  company_id: z.string().optional(),
  companyId: z.string().optional(),
  company_name: z.string(),
  companyName: z.string().optional(),
  career_url: z.string().url().optional(),
  careerUrl: z.string().url().optional(),
  role_title: z.string(),
  roleTitle: z.string().optional(),
  location: z.string().nullable(),
  employment_type: z.string().nullable(),
  employmentType: z.string().nullable().optional(),
  department: z.string().nullable(),
  listing_date: z.string().nullable(),
  listingDate: z.string().nullable().optional(),
  job_description_excerpt: z.string().nullable(),
  jobDescriptionExcerpt: z.string().nullable().optional(),
  source_url: z.string().url(),
  sourceUrl: z.string().url().optional(),
  collected_at: z.string().datetime(),
  collectedAt: z.string().datetime().optional(),
  is_fixture: z.boolean().default(false),
  isFixture: z.boolean().optional(),
  fixture_label: z.string().optional(),
  fixtureLabel: z.string().optional(),
  job_id: z.string().optional(),
  jobId: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  reasons: z.array(z.string()).optional(),
  github_owner: z.string().optional(),
  githubOwner: z.string().optional(),
  candidate_repositories: z.array(z.string()).optional(),
  candidateRepositories: z.array(z.string()).optional(),
});

export type NormalizedJobResult = z.infer<typeof NormalizedJobResultSchema>;

export const ResearchJobResponseSchema = z.object({
  job_id: z.string().uuid(),
  status: JobStatusSchema,
  stage: z.literal('researching'),
  message: z.string(),
  snapshot_id: z.string().nullable().optional(),
});

export type ResearchJobResponse = z.infer<typeof ResearchJobResponseSchema>;

/**
 * Raw record validator for external Bright Data collector outputs.
 * Accepts common key variants from Bright Data scrapers/datasets.
 */
export const BrightDataRawRecordSchema = z.object({
  company_name: z.string().optional(),
  company: z.string().optional(),
  employer_name: z.string().optional(),
  organization: z.string().optional(),
  role_title: z.string().optional(),
  job_title: z.string().optional(),
  title: z.string().optional(),
  position: z.string().optional(),
  location: z.string().nullable().optional(),
  job_location: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  job_type: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  listing_date: z.string().nullable().optional(),
  date_posted: z.string().nullable().optional(),
  posted_date: z.string().nullable().optional(),
  job_description_excerpt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  job_description: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  source_url: z.string().optional(),
  url: z.string().optional(),
  link: z.string().optional(),
  apply_url: z.string().optional(),
});

export type BrightDataRawRecord = z.infer<typeof BrightDataRawRecordSchema>;
