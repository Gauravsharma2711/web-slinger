import { z } from 'zod';
import { WorkPlanCitationItemSchema } from './workPlan.js';

/**
 * Verification check item status: strictly begins as 'not_verified'.
 */
export const VerificationCheckStatusSchema = z.literal('not_verified');
export type VerificationCheckStatus = z.infer<typeof VerificationCheckStatusSchema>;

/**
 * Individual manual verification checklist item.
 */
export const VerificationCheckItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  suggestedCommand: z.string().optional(),
  status: VerificationCheckStatusSchema.default('not_verified'),
  prerequisiteUrl: z.string().url().optional(),
});
export type VerificationCheckItem = z.infer<typeof VerificationCheckItemSchema>;

/**
 * Mandatory disclaimer text for verification plans.
 */
export const MANDATORY_VERIFICATION_DISCLAIMER =
  'All checks must be performed manually by the developer. Web-Slinger does not execute local commands or evaluate test outcomes.';

/**
 * Core content of the manual verification plan.
 */
export const VerificationPlanContentSchema = z.object({
  checklist: z.array(VerificationCheckItemSchema).min(1),
  disclaimer: z.string().default(MANDATORY_VERIFICATION_DISCLAIMER),
  sourceCitations: z.array(WorkPlanCitationItemSchema).default([]),
});
export type VerificationPlanContent = z.infer<typeof VerificationPlanContentSchema>;

/**
 * Verification plan document stored in Firestore subcollection:
 * sessions/{sessionId}/verification_plans/{issueNumber}
 */
export const VerificationPlanDocumentSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  plan: VerificationPlanContentSchema,
  model_id: z.string(),
  generated_at: z.string().datetime(),
  is_fixture: z.boolean().default(false),
});
export type VerificationPlanDocument = z.infer<typeof VerificationPlanDocumentSchema>;

/**
 * REST API response format for verification plan endpoint.
 */
export const VerificationPlanResponseSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  plan: VerificationPlanContentSchema,
  model_id: z.string(),
  generated_at: z.string().datetime(),
  is_fixture: z.boolean(),
});
export type VerificationPlanResponse = z.infer<typeof VerificationPlanResponseSchema>;
