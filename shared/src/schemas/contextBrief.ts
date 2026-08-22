import { z } from 'zod';

export const WhatToReadFirstItemSchema = z.object({
  instruction: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type WhatToReadFirstItem = z.infer<typeof WhatToReadFirstItemSchema>;

export const SourceCitationItemSchema = z.object({
  claim: z.string().min(1),
  sourceUrl: z.string().url(),
});
export type SourceCitationItem = z.infer<typeof SourceCitationItemSchema>;

export const ContextBriefContentSchema = z.object({
  summary: z.string().min(1),
  likelyContributionShape: z.string().min(1),
  whatToReadFirst: z.array(WhatToReadFirstItemSchema).min(1),
  unknownsToVerify: z.array(z.string().min(1)).min(1),
  suggestedFirstQuestion: z.string().min(1),
  sourceCitations: z.array(SourceCitationItemSchema).min(1),
});
export type ContextBriefContent = z.infer<typeof ContextBriefContentSchema>;

export const SourcePackItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
  content: z.string().optional(),
});
export type SourcePackItem = z.infer<typeof SourcePackItemSchema>;

export const ContextBriefStatusSchema = z.enum(['completed', 'needs_review', 'failed']);
export type ContextBriefStatus = z.infer<typeof ContextBriefStatusSchema>;

export const ContextBriefDocumentSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: ContextBriefStatusSchema,
  brief: ContextBriefContentSchema.nullable(),
  sources: z.array(SourcePackItemSchema),
  source_pack_version: z.string().default('1.0'),
  model_id: z.string(),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()).default([]),
  is_fixture: z.boolean().default(false),
});
export type ContextBriefDocument = z.infer<typeof ContextBriefDocumentSchema>;

export const ContextBriefResponseSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: ContextBriefStatusSchema,
  brief: ContextBriefContentSchema.nullable(),
  sources: z.array(SourcePackItemSchema),
  model_id: z.string(),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()).default([]),
  is_fixture: z.boolean().default(false),
  message: z.string().optional(),
});
export type ContextBriefResponse = z.infer<typeof ContextBriefResponseSchema>;
