import { describe, it, expect } from 'vitest';
import {
  VerificationStatusSchema,
  VerificationRecordSchema,
  SaveVerificationRecordsInputSchema,
  CreateProofReceiptInputSchema,
  ProofReceiptDocumentSchema,
  MANDATORY_RECEIPT_ATTESTATION,
} from '../src/index.js';

describe('Proof Receipt & Verification Record Shared Schemas', () => {
  it('validates VerificationStatusSchema enums', () => {
    expect(VerificationStatusSchema.parse('passed')).toBe('passed');
    expect(VerificationStatusSchema.parse('failed')).toBe('failed');
    expect(VerificationStatusSchema.parse('not_run')).toBe('not_run');
    expect(VerificationStatusSchema.parse('blocked')).toBe('blocked');
    expect(() => VerificationStatusSchema.parse('completed')).toThrow();
  });

  it('validates VerificationRecordSchema with required fields', () => {
    const validRecord = {
      checkId: 'check-1',
      label: 'Run curriculum tests',
      command: 'pnpm run test:curriculum',
      status: 'passed',
      userNotes: 'Ran 12 curriculum tests locally; all passed.',
      evidenceReference: 'Terminal exit code 0',
      recordedAt: new Date().toISOString(),
    };
    expect(VerificationRecordSchema.parse(validRecord)).toEqual(validRecord);

    // Fails when userNotes is empty
    expect(() =>
      VerificationRecordSchema.parse({
        ...validRecord,
        userNotes: '',
      })
    ).toThrow();
  });

  it('validates SaveVerificationRecordsInputSchema requires at least 1 record', () => {
    expect(() =>
      SaveVerificationRecordsInputSchema.parse({
        records: [],
      })
    ).toThrow();

    const valid = {
      records: [
        {
          checkId: 'check-1',
          label: 'Test check',
          status: 'not_run' as const,
          userNotes: 'Not executed yet.',
          recordedAt: new Date().toISOString(),
        },
      ],
    };
    expect(SaveVerificationRecordsInputSchema.parse(valid)).toBeDefined();
  });

  it('validates CreateProofReceiptInputSchema requires userAttestation to be true literal', () => {
    const valid = {
      userAttestation: true as const,
      branchName: 'fix/node-fs-lesson',
      patchId: '49a4ad26-6eee-4e59-a448-9eca4d8c5894',
    };
    expect(CreateProofReceiptInputSchema.parse(valid)).toEqual(valid);

    // Fails when userAttestation is false
    expect(() =>
      CreateProofReceiptInputSchema.parse({
        ...valid,
        userAttestation: false,
      })
    ).toThrow();
  });

  it('validates ProofReceiptDocumentSchema structure and status values', () => {
    const validDoc = {
      receipt_id: '550e8400-e29b-41d4-a716-446655440000',
      session_id: 'd93a9247-11e7-4c3b-8d3e-e4d855525703',
      issue_number: 69622,
      repository: 'freeCodeCamp/freeCodeCamp',
      branch_name: 'fix/node-fs-lesson',
      patch_id: '49a4ad26-6eee-4e59-a448-9eca4d8c5894',
      patch_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      changed_files: [
        'curriculum/challenges/english/02-javascript-algorithms-and-data-structures/lecture.md',
      ],
      total_changed_lines: 2,
      source_urls: ['https://github.com/freeCodeCamp/freeCodeCamp/issues/69622'],
      issue_url: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
      verification_records: [
        {
          checkId: 'check-1',
          label: 'Run curriculum test suite',
          command: 'pnpm run test:curriculum',
          status: 'passed' as const,
          userNotes: 'Verified all assertions pass in local development container.',
          recordedAt: new Date().toISOString(),
        },
      ],
      user_attestation: MANDATORY_RECEIPT_ATTESTATION,
      status: 'complete' as const,
      created_at: new Date().toISOString(),
      is_fixture: false,
    };

    expect(ProofReceiptDocumentSchema.parse(validDoc)).toEqual(validDoc);
  });
});
