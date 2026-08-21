import { z } from 'zod';
import { CompactHealthRecordSchema } from './health.js';
import { JobStatusSchema, JobTypeSchema, NormalizedJobResultSchema } from './job.js';

export const SessionStageSchema = z.enum([
  'created',
  'researching',
  'company_selected',
  'issue_selected',
  'context_ready',
  'proposal_ready',
  'verification_ready',
  'proof_ready',
]);

export type SessionStage = z.infer<typeof SessionStageSchema>;

export const CreateSessionInputSchema = z.object({
  stack: z
    .array(z.string().trim().min(1, 'Technology name cannot be empty'))
    .min(1, 'At least 1 technology is required')
    .max(5, 'Maximum 5 technologies allowed'),
  goal: z
    .string()
    .max(280, 'Goal cannot exceed 280 characters')
    .nullable()
    .optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

export const CurrentJobInfoSchema = z.object({
  job_id: z.string().uuid(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  message: z.string(),
  is_fixture: z.boolean().optional(),
  snapshot_id: z.string().nullable().optional(),
});

export type CurrentJobInfo = z.infer<typeof CurrentJobInfoSchema>;

export const SessionDocumentSchema = z.object({
  session_id: z.string().uuid(),
  stack: z.array(z.string()),
  normalized_stack: z.array(z.string()),
  goal: z.string().nullable(),
  stage: SessionStageSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  current_job_id: z.string().uuid().optional(),
  snapshot_id: z.string().nullable().optional(),
  research_results: z.array(NormalizedJobResultSchema).optional(),
  health: CompactHealthRecordSchema.optional(),
});

export type SessionDocument = z.infer<typeof SessionDocumentSchema>;

// Alias for backward compatibility
export const SessionSchema = SessionDocumentSchema;
export type Session = SessionDocument;

export const SessionStatusResponseSchema = z.object({
  session_id: z.string().uuid(),
  stage: SessionStageSchema,
  stack: z.array(z.string()),
  normalized_stack: z.array(z.string()),
  goal: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  ttl_seconds_remaining: z.number().int(),
  is_expired: z.boolean(),
  current_job: CurrentJobInfoSchema.optional(),
  snapshot_id: z.string().nullable().optional(),
  message: z.string().optional(),
  research_results: z.array(NormalizedJobResultSchema).optional(),
  health: CompactHealthRecordSchema.optional(),
});

export type SessionStatusResponse = z.infer<typeof SessionStatusResponseSchema>;
