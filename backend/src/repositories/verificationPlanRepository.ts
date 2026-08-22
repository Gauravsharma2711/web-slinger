import { Firestore } from '@google-cloud/firestore';
import type {
  VerificationPlanDocument,
  VerificationPlanContent,
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

export function toFirestoreVerificationPlanDocument(
  doc: VerificationPlanDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    plan: doc.plan,
    model_id: doc.model_id,
    generated_at: doc.generated_at,
    is_fixture: doc.is_fixture ?? false,
  };

  return sanitizeForFirestore(record) as Record<string, unknown>;
}

export function fromFirestoreVerificationPlanDocument(
  data: Record<string, unknown>
): VerificationPlanDocument {
  return {
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    plan: data.plan as VerificationPlanContent,
    model_id: data.model_id as string,
    generated_at: data.generated_at as string,
    is_fixture: Boolean(data.is_fixture),
  };
}

export interface VerificationPlanRepository {
  saveVerificationPlan(doc: VerificationPlanDocument): Promise<VerificationPlanDocument>;
  getVerificationPlan(sessionId: string, issueNumber: number): Promise<VerificationPlanDocument | null>;
}

export class FirestoreVerificationPlanRepository implements VerificationPlanRepository {
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    parentCollection = config.firestoreCollection,
    subcollection = 'verification_plans',
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

  async saveVerificationPlan(doc: VerificationPlanDocument): Promise<VerificationPlanDocument> {
    const firestoreData = toFirestoreVerificationPlanDocument(doc);
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(doc.session_id)
      .collection(this.subcollection)
      .doc(String(doc.issue_number));

    await docRef.set(firestoreData);
    return doc;
  }

  async getVerificationPlan(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationPlanDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(String(issueNumber));

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return fromFirestoreVerificationPlanDocument(doc.data() as Record<string, unknown>);
  }
}

export class InMemoryVerificationPlanRepository implements VerificationPlanRepository {
  // Key format: `${sessionId}:${issueNumber}`
  private plans = new Map<string, VerificationPlanDocument>();

  async saveVerificationPlan(doc: VerificationPlanDocument): Promise<VerificationPlanDocument> {
    const key = `${doc.session_id}:${doc.issue_number}`;
    this.plans.set(key, { ...doc });
    return doc;
  }

  async getVerificationPlan(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationPlanDocument | null> {
    const key = `${sessionId}:${issueNumber}`;
    const doc = this.plans.get(key);
    if (!doc) {
      return null;
    }
    return { ...doc };
  }

  clear(): void {
    this.plans.clear();
  }
}

export function createDefaultVerificationPlanRepository(): VerificationPlanRepository {
  if (config.useInMemoryRepo) {
    return new InMemoryVerificationPlanRepository();
  }
  return new FirestoreVerificationPlanRepository();
}
