import { Firestore } from '@google-cloud/firestore';
import { SessionDocument } from '@web-slinger/shared';
import { config } from '../config.js';

export function normalizeGoal(goal?: string | null): string | null {
  if (typeof goal !== 'string') return null;
  const trimmed = goal.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Converts a SessionDocument into a Firestore-safe record.
 * Ensures no undefined properties are passed to Firestore, substituting null for missing optional fields.
 */
export function toFirestoreSessionDocument(session: SessionDocument): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    session_id: session.session_id,
    stack: session.stack,
    normalized_stack: session.normalized_stack,
    goal: normalizeGoal(session.goal),
    stage: session.stage,
    created_at: session.created_at,
    updated_at: session.updated_at,
    expires_at: session.expires_at,
    current_job_id: session.current_job_id ?? null,
    research_results: session.research_results ?? null,
    health: session.health ?? null,
  };

  // Strict undefined-safety rule across all document fields
  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined) {
      doc[key] = null;
    }
  }

  return doc;
}

export function fromFirestoreSessionDocument(data: Record<string, unknown>): SessionDocument {
  return {
    session_id: data.session_id as string,
    stack: (data.stack as string[]) || [],
    normalized_stack: (data.normalized_stack as string[]) || [],
    goal: (data.goal as string | null) ?? null,
    stage: data.stage as SessionDocument['stage'],
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    expires_at: data.expires_at as string,
    current_job_id: (data.current_job_id as string | undefined) ?? undefined,
    research_results: (data.research_results as SessionDocument['research_results']) ?? undefined,
    health: (data.health as SessionDocument['health']) ?? undefined,
  };
}

export interface SessionRepository {
  createSession(session: SessionDocument): Promise<SessionDocument>;
  getSession(sessionId: string): Promise<SessionDocument | null>;
}

export class FirestoreSessionRepository implements SessionRepository {
  private firestore: Firestore;
  private collectionName: string;

  constructor(collectionName = config.firestoreCollection, firestoreInstance?: Firestore) {
    // Initializes Firestore with Application Default Credentials (ADC) or injected instance
    this.firestore =
      firestoreInstance ||
      new Firestore({
        projectId: config.googleCloudProject || undefined,
      });
    this.collectionName = collectionName;
  }

  async createSession(session: SessionDocument): Promise<SessionDocument> {
    const firestoreData = toFirestoreSessionDocument(session);
    const docRef = this.firestore.collection(this.collectionName).doc(session.session_id);
    await docRef.set(firestoreData);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionDocument | null> {
    const docRef = this.firestore.collection(this.collectionName).doc(sessionId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return null;
    }
    return fromFirestoreSessionDocument(doc.data() as Record<string, unknown>);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, SessionDocument>();

  async createSession(session: SessionDocument): Promise<SessionDocument> {
    const normalized: SessionDocument = {
      ...session,
      goal: normalizeGoal(session.goal),
    };
    this.sessions.set(normalized.session_id, { ...normalized });
    return normalized;
  }

  async getSession(sessionId: string): Promise<SessionDocument | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return { ...session };
  }

  clear(): void {
    this.sessions.clear();
  }
}

export function createDefaultSessionRepository(): SessionRepository {
  if (config.useInMemoryRepo) {
    return new InMemorySessionRepository();
  }
  return new FirestoreSessionRepository();
}
