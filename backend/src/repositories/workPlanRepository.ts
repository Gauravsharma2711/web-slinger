import { Firestore } from '@google-cloud/firestore';
import type {
  ContributionWorkPlanDocument,
  ContributionWorkPlanContent,
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

export function toFirestoreWorkPlanDocument(
  doc: ContributionWorkPlanDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    status: doc.status,
    plan: doc.plan ?? null,
    file_evidence: (doc.file_evidence || []).map((f) => ({
      path: f.path,
      ref: f.ref,
      sha: f.sha,
      htmlUrl: f.htmlUrl,
      retrievedAt: f.retrievedAt,
      content: f.content,
      sizeBytes: f.sizeBytes,
      isTruncated: f.isTruncated,
      omittedReason: f.omittedReason ?? null,
    })),
    source_pack_version: doc.source_pack_version || '1.0',
    model_id: doc.model_id,
    generated_at: doc.generated_at,
    validation_errors: doc.validation_errors || [],
    is_fixture: doc.is_fixture ?? false,
  };

  return sanitizeForFirestore(record) as Record<string, unknown>;
}

export function fromFirestoreWorkPlanDocument(
  data: Record<string, unknown>
): ContributionWorkPlanDocument {
  return {
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    status: data.status as ContributionWorkPlanDocument['status'],
    plan: (data.plan as ContributionWorkPlanContent | null) ?? null,
    file_evidence: ((data.file_evidence as Record<string, unknown>[]) || []).map((f) => ({
      path: f.path as string,
      ref: f.ref as string,
      sha: f.sha as string,
      htmlUrl: f.htmlUrl as string,
      retrievedAt: f.retrievedAt as string,
      content: f.content as string,
      sizeBytes: Number(f.sizeBytes),
      isTruncated: Boolean(f.isTruncated),
      omittedReason: (f.omittedReason as string | null) ?? undefined,
    })),
    source_pack_version: (data.source_pack_version as string) || '1.0',
    model_id: data.model_id as string,
    generated_at: data.generated_at as string,
    validation_errors: (data.validation_errors as string[]) || [],
    is_fixture: Boolean(data.is_fixture),
  };
}

export interface WorkPlanRepository {
  saveWorkPlan(planDoc: ContributionWorkPlanDocument): Promise<ContributionWorkPlanDocument>;
  getWorkPlan(sessionId: string, issueNumber: number): Promise<ContributionWorkPlanDocument | null>;
}

export class FirestoreWorkPlanRepository implements WorkPlanRepository {
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    parentCollection = config.firestoreCollection,
    subcollection = 'work_plans',
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

  async saveWorkPlan(planDoc: ContributionWorkPlanDocument): Promise<ContributionWorkPlanDocument> {
    const firestoreData = toFirestoreWorkPlanDocument(planDoc);
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(planDoc.session_id)
      .collection(this.subcollection)
      .doc(String(planDoc.issue_number));

    await docRef.set(firestoreData);
    return planDoc;
  }

  async getWorkPlan(sessionId: string, issueNumber: number): Promise<ContributionWorkPlanDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(String(issueNumber));

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return fromFirestoreWorkPlanDocument(doc.data() as Record<string, unknown>);
  }
}

export class InMemoryWorkPlanRepository implements WorkPlanRepository {
  // Key format: `${sessionId}:${issueNumber}`
  private workPlans = new Map<string, ContributionWorkPlanDocument>();

  async saveWorkPlan(planDoc: ContributionWorkPlanDocument): Promise<ContributionWorkPlanDocument> {
    const key = `${planDoc.session_id}:${planDoc.issue_number}`;
    this.workPlans.set(key, { ...planDoc });
    return planDoc;
  }

  async getWorkPlan(sessionId: string, issueNumber: number): Promise<ContributionWorkPlanDocument | null> {
    const key = `${sessionId}:${issueNumber}`;
    const planDoc = this.workPlans.get(key);
    if (!planDoc) {
      return null;
    }
    return { ...planDoc };
  }

  clear(): void {
    this.workPlans.clear();
  }
}

export function createDefaultWorkPlanRepository(): WorkPlanRepository {
  if (config.useInMemoryRepo) {
    return new InMemoryWorkPlanRepository();
  }
  return new FirestoreWorkPlanRepository();
}
