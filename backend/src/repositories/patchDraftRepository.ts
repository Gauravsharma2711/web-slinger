import { Firestore } from '@google-cloud/firestore';
import type {
  PatchDraftDocument,
  ReviewedSourceItem,
} from '@web-slinger/shared';
import { config } from '../config.js';

function sanitizeForFirestore(val: unknown): unknown {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    result[k] = sanitizeForFirestore(v);
  }
  return result;
}

export function toFirestorePatchDraftDocument(
  doc: PatchDraftDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    patch_id: doc.patch_id,
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    status: doc.status,
    diff_content: doc.diff_content,
    user_affirmation: doc.user_affirmation,
    reviewed_at: doc.reviewed_at,
    reviewed_sources: doc.reviewed_sources || [],
    changed_files: doc.changed_files || [],
    total_changed_lines: doc.total_changed_lines,
    model_id: doc.model_id,
    generated_at: doc.generated_at,
    validation_errors: doc.validation_errors || [],
    warnings: doc.warnings || [],
    is_user_edited: doc.is_user_edited ?? false,
    is_fixture: doc.is_fixture ?? false,
  };

  return sanitizeForFirestore(record) as Record<string, unknown>;
}

export function fromFirestorePatchDraftDocument(
  data: Record<string, unknown>
): PatchDraftDocument {
  return {
    patch_id: data.patch_id as string,
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    status: data.status as PatchDraftDocument['status'],
    diff_content: (data.diff_content as string) || '',
    user_affirmation: (data.user_affirmation as string) || '',
    reviewed_at: data.reviewed_at as string,
    reviewed_sources: (data.reviewed_sources as ReviewedSourceItem[]) || [],
    changed_files: (data.changed_files as string[]) || [],
    total_changed_lines: Number(data.total_changed_lines || 0),
    model_id: data.model_id as string,
    generated_at: data.generated_at as string,
    validation_errors: (data.validation_errors as string[]) || [],
    warnings: (data.warnings as string[]) || [],
    is_user_edited: Boolean(data.is_user_edited),
    is_fixture: Boolean(data.is_fixture),
  };
}

export interface PatchDraftRepository {
  savePatchDraft(doc: PatchDraftDocument): Promise<PatchDraftDocument>;
  getPatchDraft(sessionId: string, patchId: string): Promise<PatchDraftDocument | null>;
  updatePatchDraftContent(
    sessionId: string,
    patchId: string,
    diffContent: string,
    changedFiles: string[],
    totalChangedLines: number,
    validationErrors: string[],
    warnings: string[]
  ): Promise<PatchDraftDocument | null>;
}

export class FirestorePatchDraftRepository implements PatchDraftRepository {
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    parentCollection = config.firestoreCollection,
    subcollection = 'patch_drafts',
    firestoreInstance?: Firestore
  ) {
    this.firestore =
      firestoreInstance ||
      new Firestore({
        projectId: config.googleCloudProject || undefined,
        ignoreUndefinedProperties: true,
      });
    this.parentCollection = parentCollection;
    this.subcollection = subcollection;
  }

  async savePatchDraft(doc: PatchDraftDocument): Promise<PatchDraftDocument> {
    const firestoreData = toFirestorePatchDraftDocument(doc);
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(doc.session_id)
      .collection(this.subcollection)
      .doc(doc.patch_id);

    await docRef.set(firestoreData);
    return doc;
  }

  async getPatchDraft(sessionId: string, patchId: string): Promise<PatchDraftDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(patchId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return fromFirestorePatchDraftDocument(doc.data() as Record<string, unknown>);
  }

  async updatePatchDraftContent(
    sessionId: string,
    patchId: string,
    diffContent: string,
    changedFiles: string[],
    totalChangedLines: number,
    validationErrors: string[],
    warnings: string[]
  ): Promise<PatchDraftDocument | null> {
    const existing = await this.getPatchDraft(sessionId, patchId);
    if (!existing) {
      return null;
    }

    const updated: PatchDraftDocument = {
      ...existing,
      diff_content: diffContent,
      changed_files: changedFiles,
      total_changed_lines: totalChangedLines,
      validation_errors: validationErrors,
      warnings,
      is_user_edited: true,
      status: validationErrors.length === 0 ? 'completed' : 'needs_review',
    };

    return this.savePatchDraft(updated);
  }
}

export class InMemoryPatchDraftRepository implements PatchDraftRepository {
  // Key format: `${sessionId}:${patchId}`
  private drafts = new Map<string, PatchDraftDocument>();

  async savePatchDraft(doc: PatchDraftDocument): Promise<PatchDraftDocument> {
    const key = `${doc.session_id}:${doc.patch_id}`;
    this.drafts.set(key, { ...doc });
    return doc;
  }

  async getPatchDraft(sessionId: string, patchId: string): Promise<PatchDraftDocument | null> {
    const key = `${sessionId}:${patchId}`;
    const doc = this.drafts.get(key);
    if (!doc) {
      return null;
    }
    return { ...doc };
  }

  async updatePatchDraftContent(
    sessionId: string,
    patchId: string,
    diffContent: string,
    changedFiles: string[],
    totalChangedLines: number,
    validationErrors: string[],
    warnings: string[]
  ): Promise<PatchDraftDocument | null> {
    const existing = await this.getPatchDraft(sessionId, patchId);
    if (!existing) {
      return null;
    }

    const updated: PatchDraftDocument = {
      ...existing,
      diff_content: diffContent,
      changed_files: changedFiles,
      total_changed_lines: totalChangedLines,
      validation_errors: validationErrors,
      warnings,
      is_user_edited: true,
      status: validationErrors.length === 0 ? 'completed' : 'needs_review',
    };

    return this.savePatchDraft(updated);
  }

  clear(): void {
    this.drafts.clear();
  }
}

export function createDefaultPatchDraftRepository(): PatchDraftRepository {
  if (config.useInMemoryRepo) {
    return new InMemoryPatchDraftRepository();
  }
  return new FirestorePatchDraftRepository();
}
