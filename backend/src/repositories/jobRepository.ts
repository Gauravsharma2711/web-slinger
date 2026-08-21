import { Firestore } from '@google-cloud/firestore';
import { JobStatus, JobType, NormalizedJobResult } from '@web-slinger/shared';
import { config } from '../config.js';

export interface JobRecord {
  job_id: string;
  session_id: string;
  type: JobType;
  status: JobStatus;
  stage_message: string;
  results: NormalizedJobResult[];
  snapshot_id?: string | null;
  error?: string;
  created_at: string;
  updated_at: string;
}

export function toFirestoreJobRecord(job: JobRecord): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    job_id: job.job_id,
    session_id: job.session_id,
    type: job.type,
    status: job.status,
    stage_message: job.stage_message,
    results: job.results || [],
    snapshot_id: job.snapshot_id ?? null,
    error: job.error ?? null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };

  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined) {
      doc[key] = null;
    }
  }

  return doc;
}

export function fromFirestoreJobRecord(data: Record<string, unknown>): JobRecord {
  return {
    job_id: data.job_id as string,
    session_id: data.session_id as string,
    type: data.type as JobType,
    status: data.status as JobStatus,
    stage_message: (data.stage_message as string) || '',
    results: (data.results as NormalizedJobResult[]) || [],
    snapshot_id: (data.snapshot_id as string | null | undefined) ?? null,
    error: (data.error as string | undefined) ?? undefined,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export interface JobRepository {
  createJob(job: JobRecord): Promise<JobRecord>;
  getJob(jobId: string): Promise<JobRecord | null>;
  updateJob(jobId: string, updates: Partial<JobRecord>): Promise<JobRecord | null>;
  getLatestJobForSession(sessionId: string): Promise<JobRecord | null>;
}

export class InMemoryJobRepository implements JobRepository {
  private jobs = new Map<string, JobRecord>();

  async createJob(job: JobRecord): Promise<JobRecord> {
    this.jobs.set(job.job_id, { ...job });
    return job;
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return { ...job };
  }

  async updateJob(jobId: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    const existing = this.jobs.get(jobId);
    if (!existing) return null;
    const updated: JobRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  async getLatestJobForSession(sessionId: string): Promise<JobRecord | null> {
    const matching = Array.from(this.jobs.values())
      .filter((j) => j.session_id === sessionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return matching.length > 0 ? { ...matching[0] } : null;
  }

  clear(): void {
    this.jobs.clear();
  }
}

export class FirestoreJobRepository implements JobRepository {
  private firestore: Firestore;
  private collectionName: string;

  constructor(collectionName = 'jobs', firestoreInstance?: Firestore) {
    this.firestore =
      firestoreInstance ||
      new Firestore({
        projectId: config.googleCloudProject || undefined,
      });
    this.collectionName = collectionName;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    const firestoreData = toFirestoreJobRecord(job);
    await this.firestore.collection(this.collectionName).doc(job.job_id).set(firestoreData);
    return job;
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const doc = await this.firestore.collection(this.collectionName).doc(jobId).get();
    if (!doc.exists) return null;
    return fromFirestoreJobRecord(doc.data() as Record<string, unknown>);
  }

  async updateJob(jobId: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    const docRef = this.firestore.collection(this.collectionName).doc(jobId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) return null;

    const existingData = fromFirestoreJobRecord(existingDoc.data() as Record<string, unknown>);
    const merged: JobRecord = {
      ...existingData,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const firestoreData = toFirestoreJobRecord(merged);
    await docRef.set(firestoreData, { merge: true });
    return merged;
  }

  async getLatestJobForSession(sessionId: string): Promise<JobRecord | null> {
    try {
      const querySnap = await this.firestore
        .collection(this.collectionName)
        .where('session_id', '==', sessionId)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (querySnap.empty) return null;
      return fromFirestoreJobRecord(querySnap.docs[0].data() as Record<string, unknown>);
    } catch {
      // Resilient fallback if composite index is pending/missing in Firestore
      const querySnap = await this.firestore
        .collection(this.collectionName)
        .where('session_id', '==', sessionId)
        .get();

      if (querySnap.empty) return null;
      const docs = querySnap.docs.map((d) =>
        fromFirestoreJobRecord(d.data() as Record<string, unknown>)
      );
      docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return docs[0];
    }
  }
}

export function createDefaultJobRepository(): JobRepository {
  if (config.useInMemoryRepo) {
    return new InMemoryJobRepository();
  }
  return new FirestoreJobRepository();
}
