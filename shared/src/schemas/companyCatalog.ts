import { z } from 'zod';
import { NormalizedJobResult } from './job.js';

export const CompanyCatalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  careerUrl: z.string().url(),
  githubOwner: z.string().min(1),
  candidateRepositories: z.array(z.string().min(1)),
});

export type CompanyCatalogEntry = z.infer<typeof CompanyCatalogEntrySchema>;

/**
 * Curated multi-company opportunity catalog with verified mappings.
 */
export const COMPANY_CATALOG: readonly CompanyCatalogEntry[] = Object.freeze([
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    careerUrl: 'https://www.cloudflare.com/careers/jobs/',
    githubOwner: 'cloudflare',
    candidateRepositories: [
      'cloudflare/workers-sdk',
      'cloudflare/cloudflare-docs',
    ],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    careerUrl: 'https://sentry.io/careers/',
    githubOwner: 'getsentry',
    candidateRepositories: [
      'getsentry/sentry',
      'getsentry/sentry-javascript',
    ],
  },
  {
    id: 'grafana',
    name: 'Grafana Labs',
    careerUrl: 'https://grafana.com/careers/',
    githubOwner: 'grafana',
    candidateRepositories: [
      'grafana/grafana',
      'grafana/loki',
    ],
  },
]);

export function getCompanyCatalog(): readonly CompanyCatalogEntry[] {
  return COMPANY_CATALOG;
}

export function getAllCatalogSeedUrls(): string[] {
  return COMPANY_CATALOG.map((c) => c.careerUrl);
}

export function findCompanyById(id?: string | null): CompanyCatalogEntry | undefined {
  if (!id || typeof id !== 'string') return undefined;
  const clean = id.trim().toLowerCase();
  return COMPANY_CATALOG.find((c) => c.id.toLowerCase() === clean);
}

export function findCompanyByName(name?: string | null): CompanyCatalogEntry | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const clean = name.trim().toLowerCase();
  return COMPANY_CATALOG.find(
    (c) =>
      c.name.toLowerCase() === clean ||
      c.id.toLowerCase() === clean ||
      clean.includes(c.id.toLowerCase()) ||
      c.name.toLowerCase().includes(clean)
  );
}

export function findCompanyByUrl(url?: string | null): CompanyCatalogEntry | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const clean = url.trim().toLowerCase();

  return COMPANY_CATALOG.find((c) => {
    try {
      const parsedSearch = new URL(clean);
      const parsedCareer = new URL(c.careerUrl);

      // Match hostname or domain (e.g. cloudflare.com, sentry.io, grafana.com)
      if (
        parsedSearch.hostname === parsedCareer.hostname ||
        parsedSearch.hostname.endsWith(`.${parsedCareer.hostname}`) ||
        parsedCareer.hostname.endsWith(`.${parsedSearch.hostname}`) ||
        clean.startsWith(c.careerUrl.toLowerCase())
      ) {
        return true;
      }
    } catch {
      // Not a full URL, check substring
    }

    // Substring fallback
    const domainMatch = c.id.toLowerCase();
    return clean.includes(domainMatch) || clean.includes(c.name.toLowerCase());
  });
}

export const EXACT_DEMO_FIXTURE_LABEL = 'Demo sample — not a live job listing';

/**
 * Generates the curated fixture set across Cloudflare, Sentry, and Grafana Labs for DEMO_MODE=true.
 */
export function getCuratedDemoFixtures(
  stack: string[] = ['TypeScript', 'JavaScript'],
  goal?: string | null
): Array<Record<string, unknown>> {
  const primaryTech = stack[0] || 'TypeScript';
  const now = new Date().toISOString();

  return [
    {
      company_id: 'cloudflare',
      companyId: 'cloudflare',
      company_name: 'Cloudflare',
      companyName: 'Cloudflare',
      career_url: 'https://www.cloudflare.com/careers/jobs/',
      careerUrl: 'https://www.cloudflare.com/careers/jobs/',
      job_id: 'demo-cf-01',
      jobId: 'demo-cf-01',
      role_title: `Senior ${primaryTech} Systems Engineer - Workers Platform`,
      roleTitle: `Senior ${primaryTech} Systems Engineer - Workers Platform`,
      location: 'Remote (Global)',
      employment_type: 'Full-time',
      department: 'Workers Core Runtime',
      listing_date: '2026-08-20',
      job_description_excerpt: `Build next-generation edge execution runtimes and developer tooling with ${stack.join(', ')}.${goal ? ` Goal: ${goal}` : ''}`,
      source_url: 'https://www.cloudflare.com/careers/jobs/',
      sourceUrl: 'https://www.cloudflare.com/careers/jobs/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 96,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        `Relevant engineering title: "Senior ${primaryTech} Systems Engineer"`,
        'Curated open-source focus area',
      ],
      github_owner: 'cloudflare',
      githubOwner: 'cloudflare',
      candidate_repositories: ['cloudflare/workers-sdk', 'cloudflare/cloudflare-docs'],
      candidateRepositories: ['cloudflare/workers-sdk', 'cloudflare/cloudflare-docs'],
    },
    {
      company_id: 'cloudflare',
      companyId: 'cloudflare',
      company_name: 'Cloudflare',
      companyName: 'Cloudflare',
      career_url: 'https://www.cloudflare.com/careers/jobs/',
      careerUrl: 'https://www.cloudflare.com/careers/jobs/',
      job_id: 'demo-cf-02',
      jobId: 'demo-cf-02',
      role_title: `Edge Runtime Developer - Tooling & SDKs`,
      roleTitle: `Edge Runtime Developer - Tooling & SDKs`,
      location: 'San Francisco, CA / Remote',
      employment_type: 'Full-time',
      department: 'Developer Experience',
      listing_date: '2026-08-21',
      job_description_excerpt: `Contribute to wrangler, miniflare, and worker developer experience tools using ${primaryTech}.`,
      source_url: 'https://www.cloudflare.com/careers/jobs/',
      sourceUrl: 'https://www.cloudflare.com/careers/jobs/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 93,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        'Core open-source developer tooling',
      ],
      github_owner: 'cloudflare',
      githubOwner: 'cloudflare',
      candidate_repositories: ['cloudflare/workers-sdk', 'cloudflare/cloudflare-docs'],
      candidateRepositories: ['cloudflare/workers-sdk', 'cloudflare/cloudflare-docs'],
    },
    {
      company_id: 'sentry',
      companyId: 'sentry',
      company_name: 'Sentry',
      companyName: 'Sentry',
      career_url: 'https://sentry.io/careers/',
      careerUrl: 'https://sentry.io/careers/',
      job_id: 'demo-sentry-01',
      jobId: 'demo-sentry-01',
      role_title: `Staff ${primaryTech} SDK Developer - Open Source Tooling`,
      roleTitle: `Staff ${primaryTech} SDK Developer - Open Source Tooling`,
      location: 'Remote (US/EU)',
      employment_type: 'Full-time',
      department: 'SDK Ecosystem',
      listing_date: '2026-08-21',
      job_description_excerpt: `Enhance application observability, tracing, and open-source error monitoring tools using ${stack.join(', ')}.`,
      source_url: 'https://sentry.io/careers/',
      sourceUrl: 'https://sentry.io/careers/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 95,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        `Relevant engineering title: "Staff ${primaryTech} SDK Developer"`,
      ],
      github_owner: 'getsentry',
      githubOwner: 'getsentry',
      candidate_repositories: ['getsentry/sentry', 'getsentry/sentry-javascript'],
      candidateRepositories: ['getsentry/sentry', 'getsentry/sentry-javascript'],
    },
    {
      company_id: 'sentry',
      companyId: 'sentry',
      company_name: 'Sentry',
      companyName: 'Sentry',
      career_url: 'https://sentry.io/careers/',
      careerUrl: 'https://sentry.io/careers/',
      job_id: 'demo-sentry-02',
      jobId: 'demo-sentry-02',
      role_title: `Application Monitoring & Telemetry Engineer`,
      roleTitle: `Application Monitoring & Telemetry Engineer`,
      location: 'Remote',
      employment_type: 'Full-time',
      department: 'Telemetry Core',
      listing_date: '2026-08-22',
      job_description_excerpt: `Work on sentry JavaScript/browser SDKs, session replay, and performance metrics profiling.`,
      source_url: 'https://sentry.io/careers/',
      sourceUrl: 'https://sentry.io/careers/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 92,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        'Open-source crash reporting and profiling',
      ],
      github_owner: 'getsentry',
      githubOwner: 'getsentry',
      candidate_repositories: ['getsentry/sentry', 'getsentry/sentry-javascript'],
      candidateRepositories: ['getsentry/sentry', 'getsentry/sentry-javascript'],
    },
    {
      company_id: 'grafana',
      companyId: 'grafana',
      company_name: 'Grafana Labs',
      companyName: 'Grafana Labs',
      career_url: 'https://grafana.com/careers/',
      careerUrl: 'https://grafana.com/careers/',
      job_id: 'demo-grafana-01',
      jobId: 'demo-grafana-01',
      role_title: `Principal ${primaryTech} Platform Architect`,
      roleTitle: `Principal ${primaryTech} Platform Architect`,
      location: 'Remote',
      employment_type: 'Full-time',
      department: 'Observability & Dashboards',
      listing_date: '2026-08-22',
      job_description_excerpt: `Design high-throughput visualization platforms, panels, and data plugins using ${stack.join(', ')}.`,
      source_url: 'https://grafana.com/careers/',
      sourceUrl: 'https://grafana.com/careers/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 94,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        `Relevant engineering title: "Principal ${primaryTech} Platform Architect"`,
      ],
      github_owner: 'grafana',
      githubOwner: 'grafana',
      candidate_repositories: ['grafana/grafana', 'grafana/loki'],
      candidateRepositories: ['grafana/grafana', 'grafana/loki'],
    },
    {
      company_id: 'grafana',
      companyId: 'grafana',
      company_name: 'Grafana Labs',
      companyName: 'Grafana Labs',
      career_url: 'https://grafana.com/careers/',
      careerUrl: 'https://grafana.com/careers/',
      job_id: 'demo-grafana-02',
      jobId: 'demo-grafana-02',
      role_title: `Observability & Visualization Engineer`,
      roleTitle: `Observability & Visualization Engineer`,
      location: 'Remote',
      employment_type: 'Full-time',
      department: 'Plugin Ecosystem',
      listing_date: '2026-08-23',
      job_description_excerpt: `Develop Grafana open source dashboard panels and Loki log visualizers with ${primaryTech}.`,
      source_url: 'https://grafana.com/careers/',
      sourceUrl: 'https://grafana.com/careers/',
      collected_at: now,
      is_fixture: true,
      isFixture: true,
      fixture_label: EXACT_DEMO_FIXTURE_LABEL,
      fixtureLabel: EXACT_DEMO_FIXTURE_LABEL,
      score: 91,
      reasons: [
        `Matches target stack (${stack.join(', ')})`,
        'Open-source dashboarding and data exploration',
      ],
      github_owner: 'grafana',
      githubOwner: 'grafana',
      candidate_repositories: ['grafana/grafana', 'grafana/loki'],
      candidateRepositories: ['grafana/grafana', 'grafana/loki'],
    },
  ];
}

/**
 * Selects a diverse top subset of jobs (default top 5, max 2 per company when other companies have eligible jobs).
 */
export function selectDiverseTopJobs(
  rankedRecords: NormalizedJobResult[],
  maxTotal: number = 5,
  maxPerCompany: number = 2
): NormalizedJobResult[] {
  if (!rankedRecords || rankedRecords.length === 0) return [];

  const selected: NormalizedJobResult[] = [];
  const companyCounts = new Map<string, number>();
  const deferred: NormalizedJobResult[] = [];

  // Pass 1: pick in score order, respecting maxPerCompany
  for (const record of rankedRecords) {
    const compKey = (record.company_id || (record as { companyId?: string }).companyId || record.company_name || (record as { companyName?: string }).companyName || 'unknown').toLowerCase();
    const currentCount = companyCounts.get(compKey) || 0;

    if (currentCount < maxPerCompany && selected.length < maxTotal) {
      selected.push(record);
      companyCounts.set(compKey, currentCount + 1);
    } else {
      deferred.push(record);
    }
  }

  // Pass 2: If we still haven't filled up to maxTotal, backfill from deferred by highest score
  for (const record of deferred) {
    if (selected.length >= maxTotal) break;
    selected.push(record);
  }

  return selected;
}

