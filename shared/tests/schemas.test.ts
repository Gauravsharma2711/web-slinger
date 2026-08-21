import { describe, it, expect } from 'vitest';
import {
  HealthResponseSchema,
  CreateSessionInputSchema,
  SessionDocumentSchema,
  SessionStatusResponseSchema,
  SessionStageSchema,
  JobStatusSchema,
  NormalizedJobResultSchema,
  ResearchJobResponseSchema,
  StackInputSchema,
  StackProfileSchema,
  TierSchema,
  VerificationGateSchema,
} from '../src/index.js';

describe('Shared Schemas', () => {
  describe('HealthResponseSchema', () => {
    it('validates { status: "ok" }', () => {
      const result = HealthResponseSchema.safeParse({ status: 'ok' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('ok');
      }
    });

    it('rejects invalid status', () => {
      const result = HealthResponseSchema.safeParse({ status: 'error' });
      expect(result.success).toBe(false);
    });
  });

  describe('CreateSessionInputSchema', () => {
    it('validates valid stack of 1-5 technologies and optional goal', () => {
      const valid = {
        stack: ['TypeScript', 'React', 'Node.js'],
        goal: 'Looking for frontend issues to contribute to',
      };
      const result = CreateSessionInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects empty stack array', () => {
      const invalid = {
        stack: [],
      };
      const result = CreateSessionInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects stack with more than 5 technologies', () => {
      const invalid = {
        stack: ['TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust'],
      };
      const result = CreateSessionInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects empty technology strings', () => {
      const invalid = {
        stack: ['TypeScript', '   ', 'React'],
      };
      const result = CreateSessionInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects goal exceeding 280 characters', () => {
      const invalid = {
        stack: ['TypeScript'],
        goal: 'a'.repeat(281),
      };
      const result = CreateSessionInputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('SessionDocumentSchema & SessionStatusResponseSchema', () => {
    it('validates a complete session document', () => {
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 86400000).toISOString();
      const doc = {
        session_id: '123e4567-e89b-12d3-a456-426614174000',
        stack: ['TypeScript', 'React'],
        normalized_stack: ['typescript', 'react'],
        goal: 'Find beginner issues',
        stage: 'created',
        created_at: now,
        updated_at: now,
        expires_at: expires,
      };
      const result = SessionDocumentSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('validates session status response schema with goal as null or string', () => {
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 86400000).toISOString();
      const statusNullGoal = {
        session_id: '123e4567-e89b-12d3-a456-426614174000',
        stage: 'created',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        created_at: now,
        updated_at: now,
        expires_at: expires,
        ttl_seconds_remaining: 86400,
        is_expired: false,
      };
      expect(SessionStatusResponseSchema.safeParse(statusNullGoal).success).toBe(true);

      const statusWithGoal = {
        ...statusNullGoal,
        goal: 'Contribute to compiler toolchains',
      };
      expect(SessionStatusResponseSchema.safeParse(statusWithGoal).success).toBe(true);
    });
  });

  describe('Job Schemas', () => {
    it('validates all job stages', () => {
      const validStages = ['queued', 'running', 'completed', 'degraded', 'failed'];
      validStages.forEach((s) => {
        expect(JobStatusSchema.safeParse(s).success).toBe(true);
      });
      expect(JobStatusSchema.safeParse('unknown').success).toBe(false);
    });

    it('validates normalized job result with all required and nullable fields', () => {
      const result = {
        company_name: 'Vercel',
        role_title: 'Software Engineer',
        location: 'San Francisco, CA',
        employment_type: 'Full-time',
        department: 'Engineering',
        listing_date: '2026-08-01',
        job_description_excerpt: 'Looking for a TypeScript and Next.js specialist...',
        source_url: 'https://careers.example.com/jobs/123',
        collected_at: new Date().toISOString(),
        is_fixture: false,
      };
      expect(NormalizedJobResultSchema.safeParse(result).success).toBe(true);
    });

    it('validates normalized job result with nullable fields', () => {
      const result = {
        company_name: 'Calm Software Co',
        role_title: 'Full Stack Engineer',
        location: null,
        employment_type: null,
        department: null,
        listing_date: null,
        job_description_excerpt: null,
        source_url: 'https://example.com/job/456',
        collected_at: new Date().toISOString(),
        is_fixture: true,
      };
      expect(NormalizedJobResultSchema.safeParse(result).success).toBe(true);
    });

    it('validates research job response payload', () => {
      const response = {
        job_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'queued',
        stage: 'researching',
        message: 'Research job queued',
      };
      expect(ResearchJobResponseSchema.safeParse(response).success).toBe(true);
    });
  });

  describe('TierSchema & VerificationGateSchema', () => {
    it('validates tier_a and tier_b', () => {
      expect(TierSchema.safeParse('tier_a').success).toBe(true);
      expect(TierSchema.safeParse('tier_b').success).toBe(true);
      expect(TierSchema.safeParse('tier_c').success).toBe(false);
    });

    it('validates verification gate', () => {
      const gate = {
        source_acknowledged: true,
        review_acknowledged: true,
        impact_acknowledged: true,
        user_edited: true,
      };
      expect(VerificationGateSchema.safeParse(gate).success).toBe(true);
    });
  });
});
