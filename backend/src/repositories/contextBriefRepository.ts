import { Firestore } from '@google-cloud/firestore';
import {
  ContextBriefDocument,
  ContextBriefContent,
  SourcePackItem,
} from '@web-slinger/shared';
import { config } from '../config.js';

export function toFirestoreContextBriefDocument(
  doc: ContextBriefDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    status: doc.status,
    brief: doc.brief ?? null,
    sources: doc.sources || [],
    source_pack_version: doc.source_pack_version || '1.0',
    model_id: doc.model_id,
    generated_at: doc.generated_at,
    validation_errors: doc.validation_errors || [],
    is_fixture: doc.is_fixture ?? false,
  };

  // Undefined-safety rule
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) {
      record[key] = null;
    }
  }

  return record;
}

export function fromFirestoreContextBriefDocument(
  data: Record<string, unknown>
): ContextBriefDocument {
  return {
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    status: data.status as ContextBriefDocument['status'],
    brief: (data.brief as ContextBriefContent | null) ?? null,
    sources: (data.sources as SourcePackItem[]) || [],
    source_pack_version: (data.source_pack_version as string) || '1.0',
    model_id: data.model_id as string,
    generated_at: data.generated_at as string,
    validation_errors: (data.validation_errors as string[]) || [],
    is_fixture: Boolean(data.is_fixture),
  };
}

export interface ContextBriefRepository {
  saveBrief(brief: ContextBriefDocument): Promise<ContextBriefDocument>;
  getBrief(
    sessionId: string,
    issueNumber: number
  ): Promise<ContextBriefDocument | null>;
}

export class FirestoreContextBriefRepository implements ContextBriefRepository {
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    parentCollection = config.firestoreCollection,
    subcollection = 'context_briefs',
    firestoreInstance?: Firestore
  ) {
    this.firestore =
      firestoreInstance ||
      new Firestore({
        projectId: config.googleCloudProject || undefined,
      });
    this.parentCollection = parentCollection;
    this.subcollection = subcollection;
  }

  async saveBrief(brief: ContextBriefDocument): Promise<ContextBriefDocument> {
    const firestoreData = toFirestoreContextBriefDocument(brief);
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(brief.session_id)
      .collection(this.subcollection)
      .doc(String(brief.issue_number));

    await docRef.set(firestoreData);
    return brief;
  }

  async getBrief(
    sessionId: string,
    issueNumber: number
  ): Promise<ContextBriefDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(String(issueNumber));

    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return fromFirestoreContextBriefDocument(doc.data() as Record<string, unknown>);
  }
}

export class InMemoryContextBriefRepository implements ContextBriefRepository {
  // Key format: `${sessionId}:${issueNumber}`
  private briefs = new Map<string, ContextBriefDocument>();

  async saveBrief(brief: ContextBriefDocument): Promise<ContextBriefDocument> {
    const key = `${brief.session_id}:${brief.issue_number}`;
    this.briefs.set(key, { ...brief });
    return brief;
  }

  async getBrief(
    sessionId: string,
    issueNumber: number
  ): Promise<ContextBriefDocument | null> {
    const key = `${sessionId}:${issueNumber}`;
    const brief = this.briefs.get(key);
    if (!brief) {
      return null;
    }
    return { ...brief };
  }

  clear(): void {
    this.briefs.clear();
  }
}

export function createDefaultContextBriefRepository(): ContextBriefRepository {
  if (config.useInMemoryRepo) {
    return new InMemoryContextBriefRepository();
  }
  return new FirestoreContextBriefRepository();
}
