import { describe, it, expect } from 'vitest';
import {
  RepositoryFileEvidenceSchema,
  CandidateFileSchema,
  ReviewedFileSchema,
  ContributionWorkPlanContentSchema,
  ContributionWorkPlanDocumentSchema,
  WorkPlanResponseSchema,
} from '../src/schemas/workPlan.js';

describe('Shared Work Plan Schemas', () => {
  it('validates a valid RepositoryFileEvidence object', () => {
    const validEvidence = {
      path: 'curriculum/challenges/english/07-node-js/lecture.md',
      ref: 'main',
      sha: 'abc1234567890abcdef',
      htmlUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/lecture.md',
      retrievedAt: new Date().toISOString(),
      content: '# Lesson content...',
      sizeBytes: 1500,
      isTruncated: false,
    };

    const parsed = RepositoryFileEvidenceSchema.safeParse(validEvidence);
    expect(parsed.success).toBe(true);
  });

  it('validates a valid CandidateFile with confidence and evidenceUrls', () => {
    const validCandidate = {
      path: 'curriculum/challenges/english/07-node-js/lecture.md',
      confidence: 'confirmed',
      rationale: 'Directly contains inaccurate phrasing reported in issue.',
      evidenceUrls: ['https://github.com/freeCodeCamp/freeCodeCamp/issues/69622'],
    };

    const parsed = CandidateFileSchema.safeParse(validCandidate);
    expect(parsed.success).toBe(true);
  });

  it('validates a complete ContributionWorkPlanContent structure', () => {
    const validContent = {
      confirmedProblem: 'The fs lesson incorrectly claims all async methods have sync equivalents.',
      candidateFiles: [
        {
          path: 'curriculum/challenges/english/07-node-js/lecture.md',
          confidence: 'confirmed',
          rationale: 'Matches the exact paragraph cited in issue report.',
          evidenceUrls: ['https://github.com/freeCodeCamp/freeCodeCamp/issues/69622'],
        },
      ],
      reviewedFiles: [
        {
          path: 'curriculum/challenges/english/07-node-js/lecture.md',
          sha: 'abc12345',
          summary: 'Node.js core modules curriculum lesson markdown.',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/blob/main/curriculum/lecture.md',
        },
      ],
      smallestChangePlan: [
        'Locate the paragraph in curriculum/challenges/.../lecture.md discussing synchronous forms.',
        'Update wording from "for every method, there is a synchronous form" to "for many methods".',
      ],
      risksAndUnknowns: [
        'Ensure translation files or other locale versions are tracked separately.',
      ],
      manualVerificationPlan: [
        'Run pnpm test:curriculum locally to verify challenge markdown formatting.',
      ],
      sourceCitations: [
        {
          claim: 'The lesson claims every method has a synchronous version.',
          sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
        },
      ],
    };

    const parsed = ContributionWorkPlanContentSchema.safeParse(validContent);
    expect(parsed.success).toBe(true);
  });

  it('validates ContributionWorkPlanDocumentSchema with defaults and UUID session_id', () => {
    const validDoc = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      issue_number: 69622,
      status: 'completed',
      plan: {
        confirmedProblem: 'Problem description',
        candidateFiles: [
          {
            path: 'file.md',
            confidence: 'candidate',
            rationale: 'Potential file',
            evidenceUrls: ['https://github.com/freeCodeCamp/freeCodeCamp/issues/69622'],
          },
        ],
        reviewedFiles: [],
        smallestChangePlan: ['Step 1'],
        risksAndUnknowns: [],
        manualVerificationPlan: ['Run tests'],
        sourceCitations: [
          {
            claim: 'Claim',
            sourceUrl: 'https://github.com/freeCodeCamp/freeCodeCamp/issues/69622',
          },
        ],
      },
      file_evidence: [],
      generated_at: new Date().toISOString(),
      validation_errors: [],
      is_fixture: false,
    };

    const parsed = ContributionWorkPlanDocumentSchema.safeParse(validDoc);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.model_id).toBe('gemini-3.7-flash');
      expect(parsed.data.source_pack_version).toBe('1.0');
    }
  });

  it('rejects invalid WorkPlanResponse with non-uuid session_id', () => {
    const invalidResponse = {
      session_id: 'invalid-not-uuid',
      issue_number: 69622,
      status: 'completed',
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: [],
      is_fixture: false,
    };

    const parsed = WorkPlanResponseSchema.safeParse(invalidResponse);
    expect(parsed.success).toBe(false);
  });
});
