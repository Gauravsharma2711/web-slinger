import { describe, it, expect } from 'vitest';
import {
  CreatePatchDraftInputSchema,
  UpdatePatchDraftInputSchema,
  PatchDraftDocumentSchema,
  MANDATORY_USER_AFFIRMATION,
  VerificationPlanContentSchema,
  VerificationPlanDocumentSchema,
  MANDATORY_VERIFICATION_DISCLAIMER,
} from '../src/index.js';

describe('PatchDraft & VerificationPlan Shared Schemas', () => {
  it('validates CreatePatchDraftInput with valid reviewed sources and true affirmation', () => {
    const valid = {
      reviewedSources: [
        { path: 'curriculum/challenges/lecture.md', sha: 'abc123456' },
      ],
      userAffirmation: true,
    };
    const parsed = CreatePatchDraftInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects CreatePatchDraftInput when userAffirmation is false or missing', () => {
    const invalidFalse = {
      reviewedSources: [{ path: 'docs/test.md', sha: '123' }],
      userAffirmation: false,
    };
    const invalidMissing = {
      reviewedSources: [{ path: 'docs/test.md', sha: '123' }],
    };

    expect(CreatePatchDraftInputSchema.safeParse(invalidFalse).success).toBe(false);
    expect(CreatePatchDraftInputSchema.safeParse(invalidMissing).success).toBe(false);
  });

  it('rejects CreatePatchDraftInput when reviewedSources is empty', () => {
    const invalidEmpty = {
      reviewedSources: [],
      userAffirmation: true,
    };
    expect(CreatePatchDraftInputSchema.safeParse(invalidEmpty).success).toBe(false);
  });

  it('validates UpdatePatchDraftInputSchema', () => {
    const valid = { diffContent: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n' };
    expect(UpdatePatchDraftInputSchema.safeParse(valid).success).toBe(true);

    const invalid = { diffContent: '' };
    expect(UpdatePatchDraftInputSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates full PatchDraftDocument with defaults', () => {
    const validDoc = {
      patch_id: '123e4567-e89b-12d3-a456-426614174000',
      session_id: '123e4567-e89b-12d3-a456-426614174001',
      issue_number: 42,
      status: 'completed' as const,
      diff_content: '--- a/file.md\n+++ b/file.md\n@@ -1 +1 @@\n-a\n+b\n',
      user_affirmation: MANDATORY_USER_AFFIRMATION,
      reviewed_at: new Date().toISOString(),
      reviewed_sources: [{ path: 'file.md', sha: 'sha1' }],
      changed_files: ['file.md'],
      total_changed_lines: 2,
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: [],
      warnings: [],
      is_user_edited: false,
      is_fixture: false,
    };

    const parsed = PatchDraftDocumentSchema.safeParse(validDoc);
    expect(parsed.success).toBe(true);
  });

  it('validates VerificationPlanContent and enforces not_verified status on all checks', () => {
    const validPlan = {
      checklist: [
        {
          id: 'check-1',
          title: 'Run curriculum linter',
          description: 'Ensure no markdown formatting violations exist.',
          suggestedCommand: 'pnpm test:curriculum',
          status: 'not_verified' as const,
        },
      ],
      disclaimer: MANDATORY_VERIFICATION_DISCLAIMER,
      sourceCitations: [],
    };

    const parsed = VerificationPlanContentSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
  });

  it('rejects VerificationPlan when checklist item status is not "not_verified"', () => {
    const invalidStatusPlan = {
      checklist: [
        {
          id: 'check-1',
          title: 'Fake pass check',
          description: 'Claims test passed',
          status: 'passed', // Prohibited!
        },
      ],
    };

    const parsed = VerificationPlanContentSchema.safeParse(invalidStatusPlan);
    expect(parsed.success).toBe(false);
  });
});
