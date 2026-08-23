import { describe, it, expect } from 'vitest';
import {
  COMPANY_CATALOG,
  getCompanyCatalog,
  getAllCatalogSeedUrls,
  findCompanyById,
  findCompanyByName,
  findCompanyByUrl,
} from '../src/companyCatalog.js';
import {
  normalizeRawJobRecord,
  processAndRankJobRecords,
  selectDiverseTopJobs,
  scoreAndRankJobRecords,
} from '../src/services/jobTriage.js';
import {
  FixtureResearchAdapter,
  BrightDataResearchAdapter,
} from '../src/services/researchAdapter.js';
import { BrightDataClient } from '../src/services/brightDataClient.js';
import { NormalizedJobResult } from '@web-slinger/shared';

describe('Company Catalog, Attribution, and Diversity Ranking', () => {
  describe('1. Catalog Mapping & Configuration', () => {
    it('contains exact verified mappings for Cloudflare, Sentry, and Grafana Labs', () => {
      const catalog = getCompanyCatalog();
      expect(catalog).toHaveLength(3);

      const cloudflare = findCompanyById('cloudflare');
      expect(cloudflare).toBeDefined();
      expect(cloudflare?.name).toBe('Cloudflare');
      expect(cloudflare?.careerUrl).toBe('https://www.cloudflare.com/careers/jobs/');
      expect(cloudflare?.githubOwner).toBe('cloudflare');
      expect(cloudflare?.candidateRepositories).toEqual([
        'cloudflare/workers-sdk',
        'cloudflare/cloudflare-docs',
      ]);

      const sentry = findCompanyById('sentry');
      expect(sentry).toBeDefined();
      expect(sentry?.name).toBe('Sentry');
      expect(sentry?.careerUrl).toBe('https://sentry.io/careers/');
      expect(sentry?.githubOwner).toBe('getsentry');
      expect(sentry?.candidateRepositories).toEqual([
        'getsentry/sentry',
        'getsentry/sentry-javascript',
      ]);

      const grafana = findCompanyById('grafana');
      expect(grafana).toBeDefined();
      expect(grafana?.name).toBe('Grafana Labs');
      expect(grafana?.careerUrl).toBe('https://grafana.com/careers/');
      expect(grafana?.githubOwner).toBe('grafana');
      expect(grafana?.candidateRepositories).toEqual([
        'grafana/grafana',
        'grafana/loki',
      ]);
    });

    it('provides all catalog seed URLs for Bright Data batch input', () => {
      const seedUrls = getAllCatalogSeedUrls();
      expect(seedUrls).toEqual([
        'https://www.cloudflare.com/careers/jobs/',
        'https://sentry.io/careers/',
        'https://grafana.com/careers/',
      ]);
    });
  });

  describe('2. Company Attribution & Seed Derivation', () => {
    it('derives company identity from catalog seed URL first', () => {
      const raw = {
        role_title: 'Full Stack Engineer',
        url: 'https://www.cloudflare.com/careers/jobs/456789',
        description: 'Building Cloudflare Workers edge runtimes with TypeScript.',
      };

      const normalized = normalizeRawJobRecord(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.company_id).toBe('cloudflare');
      expect(normalized?.company_name).toBe('Cloudflare');
      expect(normalized?.career_url).toBe('https://www.cloudflare.com/careers/jobs/');
      expect(normalized?.github_owner).toBe('cloudflare');
      expect(normalized?.candidate_repositories).toEqual([
        'cloudflare/workers-sdk',
        'cloudflare/cloudflare-docs',
      ]);
    });

    it('never guesses company from title alone when source is from another domain', () => {
      const raw = {
        company_name: 'Independent Tech Agency',
        role_title: 'Cloudflare Workers Specialist',
        url: 'https://independent-tech.example.com/jobs/1',
        description: 'Client consulting on edge architectures.',
      };

      const normalized = normalizeRawJobRecord(raw, 'https://independent-tech.example.com/jobs');
      expect(normalized).not.toBeNull();
      // Should attribute to Independent Tech Agency, NOT Cloudflare
      expect(normalized?.company_name).toBe('Independent Tech Agency');
      expect(normalized?.company_id).not.toBe('cloudflare');
    });

    it('persists companyId, companyName, careerUrl, and sourceUrl on every normalized job', () => {
      const raw = {
        company: 'Sentry',
        title: 'Backend Developer',
        link: 'https://sentry.io/careers/python-sdk',
        job_location: 'Remote',
      };

      const normalized = normalizeRawJobRecord(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.companyId).toBe('sentry');
      expect(normalized?.companyName).toBe('Sentry');
      expect(normalized?.careerUrl).toBe('https://sentry.io/careers/');
      expect(normalized?.sourceUrl).toBe('https://sentry.io/careers/python-sdk');
    });
  });

  describe('3. Partial Company Failure & Non-Destructive Preservation', () => {
    it('preserves results from other companies if one company returns 0 usable jobs', () => {
      const mixedBatch = [
        // Sentry job
        {
          company_name: 'Sentry',
          role_title: 'Staff JavaScript Engineer',
          url: 'https://sentry.io/careers/js-1',
          description: 'Working on sentry-javascript and browser telemetry.',
        },
        // Grafana Labs job
        {
          company_name: 'Grafana Labs',
          role_title: 'Senior Go / TypeScript Developer',
          url: 'https://grafana.com/careers/grafana-1',
          description: 'Grafana dashboard platform.',
        },
        // Cloudflare raw item with invalid / missing data (partial failure)
        {
          location: 'San Francisco, CA',
          description: 'Malformed empty record without role or company',
        },
      ];

      const { allResults, topResults } = processAndRankJobRecords(mixedBatch, ['TypeScript']);

      expect(allResults).toHaveLength(2);
      expect(topResults).toHaveLength(2);

      const companies = allResults.map((r) => r.company_name);
      expect(companies).toContain('Sentry');
      expect(companies).toContain('Grafana Labs');
      expect(companies).not.toContain('Cloudflare');
    });

    it('preserves multi-job outcomes for successful companies when one seed fails, with strict catalog attribution', () => {
      const mixedBatch = [
        // Sentry job 1
        {
          company_name: 'Sentry',
          role_title: 'Senior Software Engineer, Frontend',
          url: 'https://sentry.io/careers/senior-frontend',
          description: 'Build developer tooling for crash reporting and monitoring.',
        },
        // Sentry job 2
        {
          company_name: 'Sentry',
          role_title: 'Staff Backend Systems Engineer',
          url: 'https://sentry.io/careers/staff-backend',
          description: 'High throughput ingestion pipeline with Python and Go.',
        },
        // Cloudflare job 1
        {
          company_name: 'Cloudflare',
          role_title: 'Systems Engineer - Workers Runtimes',
          url: 'https://www.cloudflare.com/careers/jobs/workers-runtime',
          description: 'Edge JavaScript and WebAssembly execution.',
        },
        // Un-attributable / invalid record from third seed (Grafana scraper returned garbage / 0 valid)
        {
          invalid_key: 12345,
        },
        {
          summary: 'Random scraper error snippet with no company or role',
        },
      ];

      const { allResults, topResults } = processAndRankJobRecords(mixedBatch, ['JavaScript', 'TypeScript', 'Go']);

      // 3 valid jobs across Sentry (2) and Cloudflare (1) preserved; 0 jobs for Grafana Labs
      expect(allResults).toHaveLength(3);
      expect(topResults).toHaveLength(3);

      // Verify strict catalog company attribution
      for (const job of allResults) {
        expect(['sentry', 'cloudflare']).toContain(job.company_id);
        expect(job.is_fixture).toBe(false);
        expect(job.career_url).toBeDefined();
        expect(job.source_url).toBeDefined();
      }

      // Ensure no fallback jobs (Oracle, freeCodeCamp, etc.) were created
      expect(allResults.some((j) => j.company_name.toLowerCase().includes('oracle'))).toBe(false);
      expect(allResults.some((j) => j.company_name.toLowerCase().includes('freecodecamp'))).toBe(false);
    });
  });

  describe('4. No Fake Fallback Policy (DEMO_MODE=false vs true)', () => {
    it('returns empty result in degraded state when live collection fails under DEMO_MODE=false', async () => {
      const mockClient = {
        isConfigured: true,
        activeConfig: {
          apiToken: 'test_token',
          collectorId: 'c_test_collector',
          seedUrls: getAllCatalogSeedUrls(),
          isConfigured: true,
          tokenFingerprint: 'abc',
          collectorFingerprint: 'def',
          collectorPrefix: 'c_',
          collectorLength: 16,
        },
        triggerCollection: async () => {
          throw new Error('Upstream DCA service unavailable');
        },
        pollSnapshot: async () => [],
      } as unknown as BrightDataClient;

      const adapter = new BrightDataResearchAdapter(mockClient);
      const result = await adapter.executeResearch('session-test-1', ['TypeScript']);

      expect(result.status).toBe('degraded');
      expect(result.results).toHaveLength(0); // Zero fake jobs generated
      expect(result.results.some((r) => r.is_fixture)).toBe(false);
    });

    it('returns clearly labelled fixtures when DEMO_MODE=true', async () => {
      const fixtureAdapter = new FixtureResearchAdapter();
      const result = await fixtureAdapter.executeResearch('session-demo-1', ['TypeScript']);

      expect(result.status).toBe('completed');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.every((r) => r.is_fixture)).toBe(true);
      expect(result.results.every((r) => r.fixture_label === 'Demo sample — not a live job listing')).toBe(true);
    });
  });

  describe('5. Top-Five Cap and Maximum-Two-Per-Company Diversity', () => {
    it('caps topResults at exactly 5 jobs even with large candidate batches', () => {
      const largeBatch: NormalizedJobResult[] = Array.from({ length: 15 }, (_, i) => ({
        company_id: i % 3 === 0 ? 'cloudflare' : i % 3 === 1 ? 'sentry' : 'grafana',
        company_name: i % 3 === 0 ? 'Cloudflare' : i % 3 === 1 ? 'Sentry' : 'Grafana Labs',
        role_title: `Engineer #${i + 1}`,
        source_url: `https://example.com/jobs/${i + 1}`,
        collected_at: new Date().toISOString(),
        is_fixture: false,
        score: 90 - i,
        location: 'Remote',
        employment_type: 'Full-time',
        department: 'Tech',
        listing_date: '2026-08-20',
        job_description_excerpt: 'Engineering role.',
      }));

      const top5 = selectDiverseTopJobs(largeBatch, 5, 2);
      expect(top5).toHaveLength(5);
    });

    it('enforces maximum 2 jobs per company when other companies have eligible jobs', () => {
      // Scenario:
      // Sentry has 4 high-scoring jobs (95, 94, 93, 92)
      // Cloudflare has 3 high-scoring jobs (91, 90, 89)
      // Grafana has 2 jobs (88, 87)
      const ranked: NormalizedJobResult[] = [
        {
          company_id: 'sentry',
          company_name: 'Sentry',
          role_title: 'Sentry Lead #1',
          score: 95,
          source_url: 'https://sentry.io/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
        {
          company_id: 'sentry',
          company_name: 'Sentry',
          role_title: 'Sentry Senior #2',
          score: 94,
          source_url: 'https://sentry.io/2',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
        {
          company_id: 'sentry',
          company_name: 'Sentry',
          role_title: 'Sentry Dev #3',
          score: 93,
          source_url: 'https://sentry.io/3',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
        {
          company_id: 'cloudflare',
          company_name: 'Cloudflare',
          role_title: 'Cloudflare Edge #1',
          score: 91,
          source_url: 'https://cloudflare.com/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
        {
          company_id: 'cloudflare',
          company_name: 'Cloudflare',
          role_title: 'Cloudflare Docs #2',
          score: 90,
          source_url: 'https://cloudflare.com/2',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
        {
          company_id: 'grafana',
          company_name: 'Grafana Labs',
          role_title: 'Grafana Platform #1',
          score: 88,
          source_url: 'https://grafana.com/1',
          collected_at: new Date().toISOString(),
          is_fixture: false,
          location: 'Remote',
          employment_type: 'Full-time',
          department: null,
          listing_date: null,
          job_description_excerpt: null,
        },
      ];

      const diverseTop5 = selectDiverseTopJobs(ranked, 5, 2);
      expect(diverseTop5).toHaveLength(5);

      const counts = diverseTop5.reduce<Record<string, number>>((acc, job) => {
        const id = job.company_id || job.company_name;
        acc[id] = (acc[id] || 0) + 1;
        return acc;
      }, {});

      // Maximum 2 per company:
      // Sentry gets 2 (not 3)
      // Cloudflare gets 2
      // Grafana Labs gets 1
      expect(counts['sentry']).toBe(2);
      expect(counts['cloudflare']).toBe(2);
      expect(counts['grafana']).toBe(1);

      // Verify the 5th item is Grafana (#88), not Sentry Dev #3 (#93)
      expect(diverseTop5.map((j) => j.role_title)).toEqual([
        'Sentry Lead #1',
        'Sentry Senior #2',
        'Cloudflare Edge #1',
        'Cloudflare Docs #2',
        'Grafana Platform #1',
      ]);
    });

    it('backfills gracefully if only one company has available jobs', () => {
      const singleCompanyJobs: NormalizedJobResult[] = Array.from({ length: 4 }, (_, i) => ({
        company_id: 'cloudflare',
        company_name: 'Cloudflare',
        role_title: `Cloudflare Role #${i + 1}`,
        score: 95 - i,
        source_url: `https://cloudflare.com/jobs/${i + 1}`,
        collected_at: new Date().toISOString(),
        is_fixture: false,
        location: 'Remote',
        employment_type: 'Full-time',
        department: null,
        listing_date: null,
        job_description_excerpt: null,
      }));

      const result = selectDiverseTopJobs(singleCompanyJobs, 5, 2);
      expect(result).toHaveLength(4);
      expect(result.every((j) => j.company_name === 'Cloudflare')).toBe(true);
    });
  });
});
