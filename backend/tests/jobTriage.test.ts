import { describe, it, expect } from 'vitest';
import {
  normalizeRawJobRecord,
  deduplicateJobRecords,
  scoreAndRankJobRecords,
  processAndRankJobRecords,
  normalizeString,
} from '../src/services/jobTriage.js';
import { NormalizedJobResult } from '@web-slinger/shared';

describe('Job Triage: Normalization, Deduplication, and Deterministic Ranking', () => {
  describe('normalizeString helper', () => {
    it('normalizes string for matching and keys', () => {
      expect(normalizeString('  Stripe, Inc. ')).toBe('stripe inc');
      expect(normalizeString('Senior Full-Stack Developer')).toBe('senior fullstack developer');
      expect(normalizeString(null)).toBe('');
    });
  });

  describe('1. Raw Record Normalization', () => {
    it('normalizes various field shapes from Bright Data', () => {
      const raw = {
        employer_name: 'Microsoft',
        job_title: 'Full Stack Engineer',
        job_location: 'Redmond, WA',
        job_type: 'Full-time',
        description: 'Building next-generation developer tooling with TypeScript and React.',
        apply_url: 'https://careers.microsoft.com/jobs/12345',
        posted_date: '2026-08-15',
      };

      const normalized = normalizeRawJobRecord(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.company_name).toBe('Microsoft');
      expect(normalized?.role_title).toBe('Full Stack Engineer');
      expect(normalized?.location).toBe('Redmond, WA');
      expect(normalized?.employment_type).toBe('Full-time');
      expect(normalized?.source_url).toBe('https://careers.microsoft.com/jobs/12345');
      expect(normalized?.is_fixture).toBe(false);
    });

    it('rejects records missing both company name and role title', () => {
      const invalid = {
        location: 'Remote',
        description: 'Empty info',
      };
      expect(normalizeRawJobRecord(invalid)).toBeNull();
    });
  });

  describe('2. Deduplication', () => {
    it('deduplicates records with matching normalized company, title, and source URL', () => {
      const records: NormalizedJobResult[] = [
        {
          company_name: 'Stripe',
          role_title: 'Software Engineer',
          location: 'Remote',
          employment_type: 'Full-time',
          department: 'Engineering',
          listing_date: '2026-08-10',
          job_description_excerpt: 'Working on payments infrastructure.',
          source_url: 'https://stripe.com/jobs/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
        {
          company_name: '  STRIPE, INC.  ',
          role_title: 'Software Engineer',
          location: 'San Francisco, CA',
          employment_type: 'Full-time',
          department: null,
          listing_date: '2026-08-12',
          job_description_excerpt: 'Duplicate listing for same role.',
          source_url: 'https://stripe.com/jobs/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
        {
          company_name: 'Stripe',
          role_title: 'Staff Engineer', // different title
          location: 'Remote',
          employment_type: 'Full-time',
          department: 'Engineering',
          listing_date: '2026-08-10',
          job_description_excerpt: 'Working on payments infrastructure.',
          source_url: 'https://stripe.com/jobs/2',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
      ];

      const deduped = deduplicateJobRecords(records);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].role_title).toBe('Software Engineer');
      expect(deduped[1].role_title).toBe('Staff Engineer');
    });
  });

  describe('3. Deterministic Scoring & Ranking', () => {
    it('scores jobs higher when matching target stack keywords and engineering titles', () => {
      const records: NormalizedJobResult[] = [
        {
          company_name: 'Acme Sales',
          role_title: 'Sales Representative',
          location: 'New York, NY',
          employment_type: 'Full-time',
          department: 'Sales',
          listing_date: null,
          job_description_excerpt: 'Cold outreach and enterprise sales.',
          source_url: 'https://acme.com/jobs/sales',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
        {
          company_name: 'Vercel',
          role_title: 'Senior Frontend Developer',
          location: 'Remote',
          employment_type: 'Full-time',
          department: 'Core Framework',
          listing_date: new Date().toISOString().slice(0, 10),
          job_description_excerpt: 'Deep experience with TypeScript, React, and Next.js performance.',
          source_url: 'https://vercel.com/careers/frontend',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
      ];

      const ranked = scoreAndRankJobRecords(records, ['TypeScript', 'React']);
      expect(ranked).toHaveLength(2);

      // Vercel job should rank first with high score and transparent reasons
      expect(ranked[0].company_name).toBe('Vercel');
      expect(ranked[0].score).toBeGreaterThan(60);
      expect(ranked[0].reasons).toBeDefined();
      expect(ranked[0].reasons?.some((r) => r.includes('TypeScript') || r.includes('React'))).toBe(true);

      // Acme sales job should rank lower
      expect(ranked[1].company_name).toBe('Acme Sales');
      expect(ranked[1].score).toBeLessThan(ranked[0].score || 0);
    });

    it('produces stable tie-breaking when scores are identical', () => {
      const records: NormalizedJobResult[] = [
        {
          company_name: 'Zeta Corp',
          role_title: 'Software Engineer',
          location: 'Remote',
          employment_type: 'Full-time',
          department: 'Tech',
          listing_date: '2026-08-01',
          job_description_excerpt: 'Writing code.',
          source_url: 'https://zeta.com/job1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
        {
          company_name: 'Alpha Corp',
          role_title: 'Software Engineer',
          location: 'Remote',
          employment_type: 'Full-time',
          department: 'Tech',
          listing_date: '2026-08-01',
          job_description_excerpt: 'Writing code.',
          source_url: 'https://alpha.com/job1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
        },
      ];

      const ranked = scoreAndRankJobRecords(records, ['TypeScript']);
      // Both have identical scores, so tie-breaker by company name puts Alpha Corp first
      expect(ranked[0].company_name).toBe('Alpha Corp');
      expect(ranked[1].company_name).toBe('Zeta Corp');
    });
  });

  describe('4. processAndRankJobRecords Pipeline & Top 5 Cap', () => {
    it('normalizes, deduplicates, ranks 8 raw records and returns all 8 while capping topResults to 5', () => {
      const rawRecords = [
        { company: 'Company 1', title: 'Senior TypeScript Engineer', url: 'https://co1.com/job' },
        { company: 'Company 2', title: 'React Developer', url: 'https://co2.com/job' },
        { company: 'Company 3', title: 'Full Stack Engineer', url: 'https://co3.com/job' },
        { company: 'Company 4', title: 'Backend Developer', url: 'https://co4.com/job' },
        { company: 'Company 5', title: 'Platform Engineer', url: 'https://co5.com/job' },
        { company: 'Company 6', title: 'DevOps Engineer', url: 'https://co6.com/job' },
        { company: 'Company 7', title: 'QA Engineer', url: 'https://co7.com/job' },
        { company: 'Company 8', title: 'Junior Developer', url: 'https://co8.com/job' },
      ];

      const { allResults, topResults } = processAndRankJobRecords(
        rawRecords,
        ['TypeScript', 'React'],
        'https://fallback.com/jobs'
      );

      // Preserves all 8 normalized records for future "Show more"
      expect(allResults).toHaveLength(8);

      // Default top results capped at exactly 5
      expect(topResults).toHaveLength(5);

      // Every record has a score between 0 and 100 and a non-empty reasons array
      for (const res of allResults) {
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(100);
        expect(res.reasons).toBeDefined();
        expect(res.reasons?.length).toBeGreaterThan(0);
      }

      // First result is the highest scored
      expect(topResults[0].score).toBeGreaterThanOrEqual(topResults[1].score || 0);
    });
  });
});
