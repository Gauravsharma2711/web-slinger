import { describe, it, expect } from 'vitest';
import { triageIssue, isOnboardingLabel } from '../src/services/issueTriage.js';

describe('Deterministic Issue Triage Engine', () => {
  describe('Onboarding Label Recognition (Case-Insensitive)', () => {
    it('recognizes standard onboarding label variations', () => {
      const positiveLabels = [
        'good first issue',
        'good-first-issue',
        'good_first_issue',
        'GOOD FIRST ISSUE',
        'Good-First-Issue',
        'help wanted',
        'help-wanted',
        'HELP WANTED',
        'starter',
        'beginner',
        'up-for-grabs',
        'first-timers-only',
        'contributions welcome',
        'easy pick',
      ];

      for (const label of positiveLabels) {
        expect(isOnboardingLabel(label)).toBe(true);
      }
    });

    it('rejects non-onboarding labels', () => {
      const nonOnboardingLabels = [
        'bug',
        'enhancement',
        'duplicate',
        'invalid',
        'question',
        'wontfix',
        'dependencies',
      ];

      for (const label of nonOnboardingLabels) {
        expect(isOnboardingLabel(label)).toBe(false);
      }
    });
  });

  describe('Tier A Classification Rules', () => {
    it('classifies open issue with onboarding label, sufficient title and body as Tier A', () => {
      const result = triageIssue({
        title: 'Add TypeScript types for navigation hooks',
        body: 'We need type definitions for navigation hooks. Please refer to existing typings in src/types/nav.ts for guidance.',
        state: 'open',
        labels: ['good-first-issue', 'typescript'],
        assignees: [],
        comments_count: 2,
      });

      expect(result.tier).toBe('A');
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
      expect(result.reasons[0]).toContain('Matched onboarding label: "good-first-issue"');
      expect(result.reasons.some((r) => r.includes('No active assignees'))).toBe(true);
    });

    it('prefers unassigned Tier A issues with higher score than assigned Tier A issues', () => {
      const unassigned = triageIssue({
        title: 'Fix typo in documentation component',
        body: 'There is a typo in the main documentation component that needs fixing according to our style guide.',
        state: 'open',
        labels: ['help wanted'],
        assignees: [],
        comments_count: 0,
      });

      const assigned = triageIssue({
        title: 'Fix typo in documentation component',
        body: 'There is a typo in the main documentation component that needs fixing according to our style guide.',
        state: 'open',
        labels: ['help wanted'],
        assignees: ['contributor1'],
        comments_count: 0,
      });

      expect(unassigned.tier).toBe('A');
      expect(assigned.tier).toBe('A');
      expect(unassigned.score).toBeGreaterThan(assigned.score);
      expect(assigned.reasons.some((r) => r.includes('Currently assigned to: contributor1'))).toBe(true);
    });
  });

  describe('Tier B Classification Rules & Honest Reasons', () => {
    it('classifies issue without onboarding label as Tier B and explains missing label', () => {
      const result = triageIssue({
        title: 'Redesign database schema for user profiles',
        body: 'Complex architecture refactor for database migration and indexes across all partitions.',
        state: 'open',
        labels: ['architecture', 'database'],
        assignees: [],
        comments_count: 12,
      });

      expect(result.tier).toBe('B');
      expect(result.score).toBeLessThan(70);
      expect(result.reasons.some((r) => r.includes('No standard onboarding label'))).toBe(true);
    });

    it('classifies issue with thin/missing body as Tier B and explains thin context', () => {
      const resultNullBody = triageIssue({
        title: 'Fix bug with button styling',
        body: null,
        state: 'open',
        labels: ['good first issue'],
        assignees: [],
        comments_count: 0,
      });

      expect(resultNullBody.tier).toBe('B');
      expect(resultNullBody.reasons.some((r) => r.includes('Thin or missing issue description'))).toBe(true);

      const resultShortBody = triageIssue({
        title: 'Fix button',
        body: 'Short text', // Under 30 chars
        state: 'open',
        labels: ['good first issue'],
        assignees: [],
        comments_count: 0,
      });

      expect(resultShortBody.tier).toBe('B');
      expect(resultShortBody.reasons.some((r) => r.includes('only 10 characters'))).toBe(true);
    });

    it('classifies non-open issue as Tier B and notes state', () => {
      const result = triageIssue({
        title: 'Completed feature request',
        body: 'This was already completed and closed in previous release.',
        state: 'closed',
        labels: ['good first issue'],
        assignees: [],
        comments_count: 1,
      });

      expect(result.tier).toBe('B');
      expect(result.reasons.some((r) => r.includes('closed or non-open issues'))).toBe(true);
    });
  });

  describe('Score Determinism & Reason Guarantees', () => {
    it('always bounds score between 0 and 100 and guarantees non-empty plain language reasons', () => {
      const testCases = [
        { title: 'T1', body: null, state: 'open', labels: [], assignees: [], comments_count: 0 },
        {
          title: 'T2 with very long description',
          body: 'A'.repeat(500),
          state: 'open',
          labels: ['good first issue', 'bug'],
          assignees: [],
          comments_count: 25,
        },
        {
          title: 'T3 assigned with many comments',
          body: 'B'.repeat(150),
          state: 'open',
          labels: ['enhancement'],
          assignees: ['alice', 'bob'],
          comments_count: 50,
        },
      ];

      for (const tc of testCases) {
        const res = triageIssue(tc);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(res.reasons.length).toBeGreaterThan(0);
        for (const reason of res.reasons) {
          expect(typeof reason).toBe('string');
          expect(reason.length).toBeGreaterThan(5);
        }
      }
    });
  });
});
