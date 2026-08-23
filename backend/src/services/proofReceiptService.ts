import { randomUUID, createHash } from 'node:crypto';
import type {
  VerificationRecord,
  VerificationRecordsDocument,
  VerificationRecordsResponse,
  CreateProofReceiptInput,
  ProofReceiptDocument,
  ProofReceiptResponse,
  ProofReceiptStatus,
  FinalReadinessResponse,
  FinalReadinessStatus,
  VerificationSummary,
  NormalizedIssue,
} from '@web-slinger/shared';
import {
  MANDATORY_RECEIPT_ATTESTATION,
  determineRepositoryRelationship,
} from '@web-slinger/shared';
import {
  VerificationRecordRepository,
  ProofReceiptRepository,
  createDefaultVerificationRecordRepository,
  createDefaultProofReceiptRepository,
} from '../repositories/proofReceiptRepository.js';
import {
  VerificationPlanRepository,
  createDefaultVerificationPlanRepository,
} from '../repositories/verificationPlanRepository.js';
import {
  PatchDraftRepository,
  createDefaultPatchDraftRepository,
} from '../repositories/patchDraftRepository.js';
import { config } from '../config.js';

export interface ProofReceiptServiceOptions {
  verificationRecordRepo?: VerificationRecordRepository;
  proofReceiptRepo?: ProofReceiptRepository;
  verificationPlanRepo?: VerificationPlanRepository;
  patchDraftRepo?: PatchDraftRepository;
  demoMode?: boolean;
}

export class ProofReceiptService {
  private verificationRecordRepo: VerificationRecordRepository;
  private proofReceiptRepo: ProofReceiptRepository;
  private verificationPlanRepo: VerificationPlanRepository;
  private patchDraftRepo: PatchDraftRepository;
  private demoMode: boolean;

  constructor(options: ProofReceiptServiceOptions = {}) {
    this.verificationRecordRepo =
      options.verificationRecordRepo || createDefaultVerificationRecordRepository();
    this.proofReceiptRepo =
      options.proofReceiptRepo || createDefaultProofReceiptRepository();
    this.verificationPlanRepo =
      options.verificationPlanRepo || createDefaultVerificationPlanRepository();
    this.patchDraftRepo =
      options.patchDraftRepo || createDefaultPatchDraftRepository();
    this.demoMode = options.demoMode ?? config.demoMode;
  }

  /**
   * Save human-entered verification records for an issue.
   */
  async saveVerificationRecords(
    sessionId: string,
    issueNumber: number,
    records: VerificationRecord[]
  ): Promise<VerificationRecordsResponse> {
    if (!records || records.length === 0) {
      throw new Error('At least one verification record is required.');
    }

    for (const rec of records) {
      if (!rec.userNotes || rec.userNotes.trim().length === 0) {
        throw new Error(`Verification record "${rec.label}" requires user notes.`);
      }
    }

    const doc: VerificationRecordsDocument = {
      session_id: sessionId,
      issue_number: issueNumber,
      records,
      updated_at: new Date().toISOString(),
      is_fixture: this.demoMode,
    };

    await this.verificationRecordRepo.saveVerificationRecords(doc);

    return {
      session_id: doc.session_id,
      issue_number: doc.issue_number,
      records: doc.records,
      updated_at: doc.updated_at,
      is_fixture: doc.is_fixture,
    };
  }

  /**
   * Retrieve verification records or generate default not_run list from verification plan.
   */
  async getVerificationRecords(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationRecordsResponse> {
    const saved = await this.verificationRecordRepo.getVerificationRecords(
      sessionId,
      issueNumber
    );

    if (saved) {
      return {
        session_id: saved.session_id,
        issue_number: saved.issue_number,
        records: saved.records,
        updated_at: saved.updated_at,
        is_fixture: saved.is_fixture,
      };
    }

    // If none saved yet, synthesize default not_run records from verification plan if available
    const planDoc = await this.verificationPlanRepo.getVerificationPlan(
      sessionId,
      issueNumber
    );

    const defaultRecords: VerificationRecord[] = planDoc?.plan?.checklist
      ? planDoc.plan.checklist.map((item) => ({
          checkId: item.id,
          label: item.title,
          command: item.suggestedCommand,
          status: 'not_run',
          userNotes: 'Not executed yet.',
          recordedAt: new Date().toISOString(),
        }))
      : [
          {
            checkId: 'manual-check-1',
            label: 'Review code changes and verify locally',
            command: 'git diff',
            status: 'not_run',
            userNotes: 'Not executed yet.',
            recordedAt: new Date().toISOString(),
          },
        ];

    return {
      session_id: sessionId,
      issue_number: issueNumber,
      records: defaultRecords,
      updated_at: new Date().toISOString(),
      is_fixture: this.demoMode,
    };
  }

  /**
   * Create a truthful Proof Receipt after user attestation.
   */
  async createProofReceipt(
    sessionId: string,
    issue: NormalizedIssue,
    input: CreateProofReceiptInput
  ): Promise<ProofReceiptResponse> {
    // 1. Mandatory user attestation gate
    if (input.userAttestation !== true) {
      const err = new Error(
        'User attestation is required before generating a Proof Receipt.'
      );
      (err as unknown as { statusCode: number }).statusCode = 409;
      throw err;
    }

    // 2. Retrieve verification records
    const recordsResponse = await this.getVerificationRecords(sessionId, issue.number);
    const records = recordsResponse.records;

    // 3. Retrieve associated patch draft
    let patchDraft = null;
    if (input.patchId) {
      patchDraft = await this.patchDraftRepo.getPatchDraft(
        sessionId,
        input.patchId
      );
    } else {
      patchDraft = await this.patchDraftRepo.getLatestPatchDraftForIssue(
        sessionId,
        issue.number
      );
    }

    if (!patchDraft) {
      const err = new Error(
        'A valid patch draft must be generated before creating a Proof Receipt.'
      );
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    }

    // 4. Calculate patch hash (SHA-256)
    const patchHash = createHash('sha256')
      .update(patchDraft.diff_content, 'utf8')
      .digest('hex');

    // 5. Determine complete vs incomplete status honestly
    // A receipt is complete only if every required check has an explicit evaluated status
    // (passed, failed, or blocked). If any check is 'not_run', it remains 'incomplete'.
    const hasNotRunChecks = records.some((r) => r.status === 'not_run');
    const status: ProofReceiptStatus =
      records.length > 0 && !hasNotRunChecks ? 'complete' : 'incomplete';

    // 6. Source URLs list
    const sourceUrls = [
      issue.html_url,
      ...patchDraft.reviewed_sources.map(
        (s) => `https://github.com/${config.githubTargetOwner}/${config.githubTargetRepo}/blob/main/${s.path}`
      ),
    ];

    const receiptDoc: ProofReceiptDocument = {
      receipt_id: randomUUID(),
      session_id: sessionId,
      issue_number: issue.number,
      repository: `${config.githubTargetOwner}/${config.githubTargetRepo}`,
      branch_name: input.branchName || null,
      patch_id: patchDraft.patch_id,
      patch_hash: patchHash,
      changed_files: patchDraft.changed_files,
      total_changed_lines: patchDraft.total_changed_lines,
      source_urls: sourceUrls,
      issue_url: issue.html_url,
      verification_records: records,
      user_attestation: MANDATORY_RECEIPT_ATTESTATION,
      status,
      created_at: new Date().toISOString(),
      is_fixture: this.demoMode || issue.is_fixture,
    };

    await this.proofReceiptRepo.saveProofReceipt(receiptDoc);

    return receiptDoc;
  }

  /**
   * Retrieve a saved Proof Receipt.
   */
  async getProofReceipt(
    sessionId: string,
    issueNumber: number
  ): Promise<ProofReceiptResponse | null> {
    return this.proofReceiptRepo.getProofReceipt(sessionId, issueNumber);
  }

  /**
   * Derive a concise FinalReadiness response strictly from existing saved data.
   * User-entered verification records are the only source of pass/fail/blocked/not-run status.
   * Never returns session IDs, TTLs, raw API status, tokens, collector/model names, or debug fields.
   */
  async getFinalReadiness(
    sessionId: string,
    issue: NormalizedIssue
  ): Promise<FinalReadinessResponse> {
    // 1. Retrieve verification records (or default not_run list from verification plan if none saved yet)
    const recordsResponse = await this.getVerificationRecords(sessionId, issue.number);
    const records = recordsResponse.records || [];

    // 2. Compute verification summary strictly from user-entered / loaded records
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let notRun = 0;

    for (const rec of records) {
      if (rec.status === 'passed') passed++;
      else if (rec.status === 'failed') failed++;
      else if (rec.status === 'blocked') blocked++;
      else if (rec.status === 'not_run') notRun++;
    }

    const verificationSummary: VerificationSummary = {
      passed,
      failed,
      blocked,
      notRun,
    };

    // 3. Determine readinessStatus:
    // ready_for_manual_handoff is allowed ONLY when required verification records have explicit statuses
    // and none are failed or blocked (i.e. at least 1 check, notRun === 0, failed === 0, blocked === 0).
    const isReady =
      records.length > 0 &&
      notRun === 0 &&
      failed === 0 &&
      blocked === 0;

    const readinessStatus: FinalReadinessStatus = isReady
      ? 'ready_for_manual_handoff'
      : 'needs_attention';

    // 4. Retrieve patch draft to check status & reviewed sources count
    const patchDraft = await this.patchDraftRepo.getLatestPatchDraftForIssue(
      sessionId,
      issue.number
    );

    const patchStatus = patchDraft ? patchDraft.status : 'not_started';
    const reviewedSourceCount = patchDraft?.reviewed_sources?.length || 0;

    // 5. Determine repository relationship label
    const repositoryRelationshipLabel =
      issue.repository_relationship_label ||
      determineRepositoryRelationship(
        config.githubTargetOwner,
        config.githubTargetRepo,
        null
      ).label;

    return {
      selectedIssue: {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
      },
      repositoryRelationshipLabel,
      reviewedSourceCount,
      patchStatus,
      verificationSummary,
      readinessStatus,
    };
  }
}

export function createDefaultProofReceiptService(): ProofReceiptService {
  return new ProofReceiptService();
}
