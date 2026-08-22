import { z } from 'zod';

/**
 * Reviewed source file item verified by the human contributor.
 */
export const ReviewedSourceItemSchema = z.object({
  path: z.string().min(1),
  sha: z.string().min(1),
});
export type ReviewedSourceItem = z.infer<typeof ReviewedSourceItemSchema>;

/**
 * The mandatory exact user affirmation string required before patch drafting.
 */
export const MANDATORY_USER_AFFIRMATION =
  'I opened the cited sources and understand this is a draft. I will review, edit, and test any proposed change myself.';

/**
 * Input for creating a new patch draft.
 */
export const CreatePatchDraftInputSchema = z.object({
  reviewedSources: z.array(ReviewedSourceItemSchema).min(1),
  userAffirmation: z.literal(true),
});
export type CreatePatchDraftInput = z.infer<typeof CreatePatchDraftInputSchema>;

/**
 * Input for user-editing an existing patch draft.
 */
export const UpdatePatchDraftInputSchema = z.object({
  diffContent: z.string().min(1),
});
export type UpdatePatchDraftInput = z.infer<typeof UpdatePatchDraftInputSchema>;

/**
 * Status of the patch draft generation.
 */
export const PatchDraftStatusSchema = z.enum(['completed', 'needs_review', 'failed']);
export type PatchDraftStatus = z.infer<typeof PatchDraftStatusSchema>;

/**
 * Details of changed files within the unified diff.
 */
export const PatchDraftFileChangeSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().optional(),
  newPath: z.string().optional(),
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative(),
});
export type PatchDraftFileChange = z.infer<typeof PatchDraftFileChangeSchema>;

/**
 * Patch draft document stored in Firestore subcollection:
 * sessions/{sessionId}/patch_drafts/{patchId}
 */
export const PatchDraftDocumentSchema = z.object({
  patch_id: z.string().uuid(),
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: PatchDraftStatusSchema,
  diff_content: z.string(),
  user_affirmation: z.string(),
  reviewed_at: z.string().datetime(),
  reviewed_sources: z.array(ReviewedSourceItemSchema),
  changed_files: z.array(z.string()),
  total_changed_lines: z.number().int().nonnegative(),
  model_id: z.string(),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  is_user_edited: z.boolean().default(false),
  is_fixture: z.boolean().default(false),
});
export type PatchDraftDocument = z.infer<typeof PatchDraftDocumentSchema>;

/**
 * REST API response format for patch draft endpoints.
 */
export const PatchDraftResponseSchema = z.object({
  patch_id: z.string().uuid(),
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  status: PatchDraftStatusSchema,
  diff_content: z.string(),
  user_affirmation: z.string(),
  reviewed_at: z.string().datetime(),
  reviewed_sources: z.array(ReviewedSourceItemSchema),
  changed_files: z.array(z.string()),
  total_changed_lines: z.number().int().nonnegative(),
  model_id: z.string(),
  generated_at: z.string().datetime(),
  validation_errors: z.array(z.string()),
  warnings: z.array(z.string()),
  is_user_edited: z.boolean(),
  is_fixture: z.boolean(),
});
export type PatchDraftResponse = z.infer<typeof PatchDraftResponseSchema>;
