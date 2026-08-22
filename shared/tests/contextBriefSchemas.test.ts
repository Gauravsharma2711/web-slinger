import { describe, it, expect } from 'vitest';
import {
  ContextBriefContentSchema,
  ContextBriefDocumentSchema,
  ContextBriefResponseSchema,
  WhatToReadFirstItemSchema,
  SourceCitationItemSchema,
} from '../src/schemas/contextBrief.js';

describe('ContextBrief Shared Schemas', () => {
  const validBriefContent = {
    summary: 'The issue describes a hydration mismatch in React 19 server components.',
    likelyContributionShape: 'Refactor component suspense boundaries and update unit tests.',
    whatToReadFirst: [
      {
        instruction: 'Read issue description and reproduction steps.',
        sourceUrl: 'https://github.com/facebook/react/issues/101',
      },
    ],
    unknownsToVerify: [
      'Verify if the mismatch occurs only in dev mode or production build as well.',
    ],
    suggestedFirstQuestion:
      'Is there a specific minimal reproduction repository we should test against?',
    sourceCitations: [
      {
        claim: 'Hydration mismatch occurs when suspense boundary is nested within async layout.',
        sourceUrl: 'https://github.com/facebook/react/issues/101',
      },
    ],
  };

  it('validates a correct ContextBriefContent structure', () => {
    const parsed = ContextBriefContentSchema.safeParse(validBriefContent);
    expect(parsed.success).toBe(true);
  });

  it('rejects empty summary or empty whatToReadFirst in ContextBriefContent', () => {
    const invalidContent = {
      ...validBriefContent,
      summary: '',
      whatToReadFirst: [],
    };
    const parsed = ContextBriefContentSchema.safeParse(invalidContent);
    expect(parsed.success).toBe(false);
  });

  it('validates a complete ContextBriefDocument', () => {
    const doc = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      issue_number: 101,
      status: 'completed',
      brief: validBriefContent,
      sources: [
        {
          title: 'Issue #101',
          url: 'https://github.com/facebook/react/issues/101',
          retrievedAt: new Date().toISOString(),
        },
      ],
      source_pack_version: '1.0',
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: [],
      is_fixture: false,
    };

    const parsed = ContextBriefDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('validates a needs_review ContextBriefDocument with validation errors', () => {
    const doc = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      issue_number: 101,
      status: 'needs_review',
      brief: null,
      sources: [],
      source_pack_version: '1.0',
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: ['Model output could not be parsed as valid JSON.'],
      is_fixture: false,
    };

    const parsed = ContextBriefDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
  });

  it('validates ContextBriefResponse format', () => {
    const response = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      issue_number: 101,
      status: 'completed',
      brief: validBriefContent,
      sources: [
        {
          title: 'Issue #101',
          url: 'https://github.com/facebook/react/issues/101',
          retrievedAt: new Date().toISOString(),
        },
      ],
      model_id: 'gemini-3.7-flash',
      generated_at: new Date().toISOString(),
      validation_errors: [],
      is_fixture: false,
    };

    const parsed = ContextBriefResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
  });
});
