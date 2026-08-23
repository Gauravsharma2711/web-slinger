import { Firestore } from '@google-cloud/firestore';
import type {
  VerificationRecordsDocument,
  VerificationRecord,
  ProofReceiptDocument,
  ProofReceiptStatus,
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

export function toFirestoreVerificationRecordsDocument(
  doc: VerificationRecordsDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    records: doc.records,
    updated_at: doc.updated_at,
    is_fixture: doc.is_fixture ?? false,
  };
  return sanitizeForFirestore(record) as Record<string, unknown>;
}

export function fromFirestoreVerificationRecordsDocument(
  data: Record<string, unknown>
): VerificationRecordsDocument {
  return {
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    records: (data.records as VerificationRecord[]) || [],
    updated_at: data.updated_at as string,
    is_fixture: Boolean(data.is_fixture),
  };
}

export function toFirestoreProofReceiptDocument(
  doc: ProofReceiptDocument
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    receipt_id: doc.receipt_id,
    session_id: doc.session_id,
    issue_number: doc.issue_number,
    repository: doc.repository,
    branch_name: doc.branch_name ?? null,
    patch_id: doc.patch_id,
    patch_hash: doc.patch_hash,
    changed_files: doc.changed_files,
    total_changed_lines: doc.total_changed_lines,
    source_urls: doc.source_urls,
    issue_url: doc.issue_url,
    verification_records: doc.verification_records,
    user_attestation: doc.user_attestation,
    status: doc.status,
    created_at: doc.created_at,
    is_fixture: doc.is_fixture ?? false,
  };
  return sanitizeForFirestore(record) as Record<string, unknown>;
}

export function fromFirestoreProofReceiptDocument(
  data: Record<string, unknown>
): ProofReceiptDocument {
  return {
    receipt_id: data.receipt_id as string,
    session_id: data.session_id as string,
    issue_number: Number(data.issue_number),
    repository: data.repository as string,
    branch_name: (data.branch_name as string) ?? undefined,
    patch_id: data.patch_id as string,
    patch_hash: data.patch_hash as string,
    changed_files: (data.changed_files as string[]) || [],
    total_changed_lines: Number(data.total_changed_lines || 0),
    source_urls: (data.source_urls as string[]) || [],
    issue_url: data.issue_url as string,
    verification_records: (data.verification_records as VerificationRecord[]) || [],
    user_attestation: data.user_attestation as string,
    status: data.status as ProofReceiptStatus,
    created_at: data.created_at as string,
    is_fixture: Boolean(data.is_fixture),
  };
}

export interface VerificationRecordRepository {
  saveVerificationRecords(
    doc: VerificationRecordsDocument
  ): Promise<VerificationRecordsDocument>;
  getVerificationRecords(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationRecordsDocument | null>;
}

export interface ProofReceiptRepository {
  saveProofReceipt(doc: ProofReceiptDocument): Promise<ProofReceiptDocument>;
  getProofReceipt(
    sessionId: string,
    issueNumber: number
  ): Promise<ProofReceiptDocument | null>;
}

export class FirestoreVerificationRecordRepository
  implements VerificationRecordRepository
{
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    firestore?: Firestore,
    parentCollection = 'sessions',
    subcollection = 'verification_records'
  ) {
    this.firestore =
      firestore ||
      new Firestore({
        projectId: config.googleCloudProject,
        ignoreUndefinedProperties: true,
      });
    this.parentCollection = parentCollection;
    this.subcollection = subcollection;
  }

  async saveVerificationRecords(
    doc: VerificationRecordsDocument
  ): Promise<VerificationRecordsDocument> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(doc.session_id)
      .collection(this.subcollection)
      .doc(String(doc.issue_number));

    const firestoreData = toFirestoreVerificationRecordsDocument(doc);
    await docRef.set(firestoreData);
    return doc;
  }

  async getVerificationRecords(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationRecordsDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(String(issueNumber));

    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data();
    if (!data) return null;
    return fromFirestoreVerificationRecordsDocument(data);
  }
}

export class InMemoryVerificationRecordRepository
  implements VerificationRecordRepository
{
  private records: Map<string, VerificationRecordsDocument> = new Map();

  private makeKey(sessionId: string, issueNumber: number): string {
    return `${sessionId}::${issueNumber}`;
  }

  async saveVerificationRecords(
    doc: VerificationRecordsDocument
  ): Promise<VerificationRecordsDocument> {
    this.records.set(this.makeKey(doc.session_id, doc.issue_number), doc);
    return doc;
  }

  async getVerificationRecords(
    sessionId: string,
    issueNumber: number
  ): Promise<VerificationRecordsDocument | null> {
    return this.records.get(this.makeKey(sessionId, issueNumber)) || null;
  }

  clear(): void {
    this.records.clear();
  }
}

export class FirestoreProofReceiptRepository implements ProofReceiptRepository {
  private firestore: Firestore;
  private parentCollection: string;
  private subcollection: string;

  constructor(
    firestore?: Firestore,
    parentCollection = 'sessions',
    subcollection = 'proof_receipts'
  ) {
    this.firestore =
      firestore ||
      new Firestore({
        projectId: config.googleCloudProject,
        ignoreUndefinedProperties: true,
      });
    this.parentCollection = parentCollection;
    this.subcollection = subcollection;
  }

  async saveProofReceipt(
    doc: ProofReceiptDocument
  ): Promise<ProofReceiptDocument> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(doc.session_id)
      .collection(this.subcollection)
      .doc(String(doc.issue_number));

    const firestoreData = toFirestoreProofReceiptDocument(doc);
    await docRef.set(firestoreData);
    return doc;
  }

  async getProofReceipt(
    sessionId: string,
    issueNumber: number
  ): Promise<ProofReceiptDocument | null> {
    const docRef = this.firestore
      .collection(this.parentCollection)
      .doc(sessionId)
      .collection(this.subcollection)
      .doc(String(issueNumber));

    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data();
    if (!data) return null;
    return fromFirestoreProofReceiptDocument(data);
  }
}

export class InMemoryProofReceiptRepository implements ProofReceiptRepository {
  private receipts: Map<string, ProofReceiptDocument> = new Map();

  private makeKey(sessionId: string, issueNumber: number): string {
    return `${sessionId}::${issueNumber}`;
  }

  async saveProofReceipt(
    doc: ProofReceiptDocument
  ): Promise<ProofReceiptDocument> {
    this.receipts.set(this.makeKey(doc.session_id, doc.issue_number), doc);
    return doc;
  }

  async getProofReceipt(
    sessionId: string,
    issueNumber: number
  ): Promise<ProofReceiptDocument | null> {
    return this.receipts.get(this.makeKey(sessionId, issueNumber)) || null;
  }

  clear(): void {
    this.receipts.clear();
  }
}

export function createDefaultVerificationRecordRepository(): VerificationRecordRepository {
  return new FirestoreVerificationRecordRepository();
}

export function createDefaultProofReceiptRepository(): ProofReceiptRepository {
  return new FirestoreProofReceiptRepository();
}
