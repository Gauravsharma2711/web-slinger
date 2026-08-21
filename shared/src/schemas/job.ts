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
  company_name: z.string(),
  role_title: z.string(),
  location: z.string().nullable(),
  employment_type: z.string().nullable(),
  department: z.string().nullable(),
  listing_date: z.string().nullable(),
  job_description_excerpt: z.string().nullable(),
  source_url: z.string().url(),
  collected_at: z.string().datetime(),
  is_fixture: z.boolean().default(false),
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
