import { z } from 'zod';

/**
 * Possible evaluation status for an individual manual verification check.
 * Strictly begins as 'not_run'.
 */
export const VerificationStatusSchema = z.enum([
  'passed',
  'failed',
  'not_run',
  'blocked',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * Human-reported verification check item record.
 */
export const VerificationRecordSchema = z.object({
  checkId: z.string().min(1),
  label: z.string().min(1),
  command: z.string().optional(),
  status: VerificationStatusSchema,
  userNotes: z.string().min(1),
  evidenceReference: z.string().optional(),
  recordedAt: z.string().datetime(),
});
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;

/**
 * Input for saving human-reported verification records for an issue.
 */
export const SaveVerificationRecordsInputSchema = z.object({
  records: z.array(VerificationRecordSchema).min(1),
});
export type SaveVerificationRecordsInput = z.infer<
  typeof SaveVerificationRecordsInputSchema
>;

/**
 * Container document for verification records stored in Firestore subcollection:
 * sessions/{sessionId}/verification_records/{issueNumber}
 */
export const VerificationRecordsDocumentSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  records: z.array(VerificationRecordSchema),
  updated_at: z.string().datetime(),
  is_fixture: z.boolean().default(false),
});
export type VerificationRecordsDocument = z.infer<
  typeof VerificationRecordsDocumentSchema
>;

/**
 * Response for verification records endpoint.
 */
export const VerificationRecordsResponseSchema = z.object({
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  records: z.array(VerificationRecordSchema),
  updated_at: z.string().datetime(),
  is_fixture: z.boolean(),
});
export type VerificationRecordsResponse = z.infer<
  typeof VerificationRecordsResponseSchema
>;

/**
 * The mandatory exact user attestation required before generating a Proof Receipt.
 */
export const MANDATORY_RECEIPT_ATTESTATION =
  'I reviewed the source files and patch, applied any change in my own local workspace, and recorded these verification results truthfully.';

/**
 * Status of the Proof Receipt.
 * 'complete': All required checks in the verification plan have been evaluated (passed, failed, or blocked - none is not_run).
 * 'incomplete': One or more checks remain not_run or unaddressed.
 */
export const ProofReceiptStatusSchema = z.enum(['complete', 'incomplete']);
export type ProofReceiptStatus = z.infer<typeof ProofReceiptStatusSchema>;

/**
 * Input for generating a Proof Receipt.
 */
export const CreateProofReceiptInputSchema = z.object({
  userAttestation: z.literal(true),
  branchName: z.string().optional(),
  patchId: z.string().uuid().optional(),
});
export type CreateProofReceiptInput = z.infer<
  typeof CreateProofReceiptInputSchema
>;

/**
 * Proof Receipt document stored in Firestore subcollection:
 * sessions/{sessionId}/proof_receipts/{issueNumber}
 */
export const ProofReceiptDocumentSchema = z.object({
  receipt_id: z.string().uuid(),
  session_id: z.string().uuid(),
  issue_number: z.number().int().positive(),
  repository: z.string().min(1),
  branch_name: z.string().nullable().optional(),
  patch_id: z.string().uuid(),
  patch_hash: z.string().min(1),
  changed_files: z.array(z.string()),
  total_changed_lines: z.number().int().nonnegative(),
  source_urls: z.array(z.string()),
  issue_url: z.string().url(),
  verification_records: z.array(VerificationRecordSchema),
  user_attestation: z.string(),
  status: ProofReceiptStatusSchema,
  created_at: z.string().datetime(),
  is_fixture: z.boolean().default(false),
});
export type ProofReceiptDocument = z.infer<typeof ProofReceiptDocumentSchema>;

/**
 * REST API response format for proof receipt endpoints.
 */
export const ProofReceiptResponseSchema = ProofReceiptDocumentSchema;
export type ProofReceiptResponse = z.infer<typeof ProofReceiptResponseSchema>;

/**
 * Final readiness status for manual handoff.
 * 'ready_for_manual_handoff': Allowed ONLY when required verification records have explicit statuses and NONE are failed or blocked.
 * 'needs_attention': When one or more checks are failed, blocked, not_run, or missing.
 * NOTE: 'ready_for_manual_handoff' does NOT mean code is correct, pushed, submitted, or accepted.
 */
export const FinalReadinessStatusSchema = z.enum([
  'ready_for_manual_handoff',
  'needs_attention',
]);
export type FinalReadinessStatus = z.infer<typeof FinalReadinessStatusSchema>;

/**
 * Summary counts of human-entered verification records.
 */
export const VerificationSummarySchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  notRun: z.number().int().nonnegative(),
});
export type VerificationSummary = z.infer<typeof VerificationSummarySchema>;

/**
 * Selected issue minimal summary without internal debug metadata.
 */
export const SelectedIssueReadinessSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
});
export type SelectedIssueReadiness = z.infer<
  typeof SelectedIssueReadinessSchema
>;

/**
 * FinalReadiness response contract derived strictly from existing saved data.
 * Does NOT contain session IDs, TTLs, raw API status, tokens, collector/model names, or debug fields.
 */
export const FinalReadinessResponseSchema = z.object({
  selectedIssue: SelectedIssueReadinessSchema,
  repositoryRelationshipLabel: z.string().min(1),
  reviewedSourceCount: z.number().int().nonnegative(),
  patchStatus: z.string().min(1),
  verificationSummary: VerificationSummarySchema,
  readinessStatus: FinalReadinessStatusSchema,
});
export type FinalReadinessResponse = z.infer<
  typeof FinalReadinessResponseSchema
>;
