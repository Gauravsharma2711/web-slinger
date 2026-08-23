import {
  NormalizedJobResult,
  NormalizedJobResultSchema,
  BrightDataRawRecordSchema,
  findCompanyByUrl,
  findCompanyByName,
  findCompanyById,
} from '@web-slinger/shared';

/**
 * Clean and normalize a string for deduplication keys and matching.
 */
export function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes company name for deduplication by stripping punctuation and corporate suffixes.
 */
export function normalizeCompanyName(company: string | null | undefined): string {
  if (!company) return '';
  return company
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(inc|incorporated|corp|corporation|llc|ltd|limited|co|company|technologies|labs)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes job title for deduplication.
 */
export function normalizeJobTitle(title: string | null | undefined): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a single raw record from Bright Data collector output.
 * Derives company identity from the catalog seed first; never guesses from a title alone.
 */
export function normalizeRawJobRecord(
  item: unknown,
  fallbackSeedUrl: string = 'https://www.cloudflare.com/careers/jobs/'
): NormalizedJobResult | null {
  const parseResult = BrightDataRawRecordSchema.safeParse(item);
  if (!parseResult.success) {
    return null;
  }

  const raw = parseResult.data as Record<string, unknown>;
  const rawCompanyName = (
    (typeof raw.company_name === 'string' && raw.company_name) ||
    (typeof raw.company === 'string' && raw.company) ||
    (typeof raw.employer_name === 'string' && raw.employer_name) ||
    (typeof raw.organization === 'string' && raw.organization) ||
    ''
  ).trim();

  const roleTitle = (
    (typeof raw.role_title === 'string' && raw.role_title) ||
    (typeof raw.job_title === 'string' && raw.job_title) ||
    (typeof raw.title === 'string' && raw.title) ||
    (typeof raw.position === 'string' && raw.position) ||
    ''
  ).trim();

  // If both company name and role title are missing, record is invalid
  if (!rawCompanyName && !roleTitle) {
    return null;
  }

  const rawSourceUrl = (
    (typeof raw.source_url === 'string' && raw.source_url) ||
    (typeof raw.url === 'string' && raw.url) ||
    (typeof raw.link === 'string' && raw.link) ||
    (typeof raw.apply_url === 'string' && raw.apply_url) ||
    (typeof raw.input_url === 'string' && raw.input_url) ||
    fallbackSeedUrl
  ).trim();

  let validUrl = fallbackSeedUrl;
  try {
    const parsed = new URL(rawSourceUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      validUrl = rawSourceUrl;
    }
  } catch {
    validUrl = fallbackSeedUrl;
  }

  // Derive company identity from catalog seed first (URLs from record), then company name, then fallback seed URL. Never from title alone!
  const matchedCompany =
    findCompanyByUrl(validUrl) ||
    findCompanyByUrl(typeof raw.input_url === 'string' ? raw.input_url : undefined) ||
    findCompanyByUrl(typeof raw.career_url === 'string' ? raw.career_url : undefined) ||
    findCompanyByName(rawCompanyName) ||
    (typeof raw.company_id === 'string' ? findCompanyById(raw.company_id) : undefined) ||
    (!rawCompanyName ? findCompanyByUrl(fallbackSeedUrl) : undefined);

  const finalCompanyId = matchedCompany?.id || normalizeCompanyName(rawCompanyName) || 'unknown';
  const finalCompanyName = matchedCompany?.name || rawCompanyName || 'Technology Enterprise';
  const finalCareerUrl = matchedCompany?.careerUrl || fallbackSeedUrl;
  const finalRole = roleTitle || 'Software Engineer';

  const rawExcerpt =
    (typeof raw.job_description_excerpt === 'string' && raw.job_description_excerpt) ||
    (typeof raw.description === 'string' && raw.description) ||
    (typeof raw.job_description === 'string' && raw.job_description) ||
    (typeof raw.summary === 'string' && raw.summary) ||
    null;
  const excerpt = rawExcerpt ? rawExcerpt.trim().slice(0, 500) : null;

  const candidate: NormalizedJobResult = {
    company_id: finalCompanyId,
    companyId: finalCompanyId,
    company_name: finalCompanyName,
    companyName: finalCompanyName,
    career_url: finalCareerUrl,
    careerUrl: finalCareerUrl,
    role_title: finalRole,
    roleTitle: finalRole,
    location: (raw.location as string) ?? (raw.job_location as string) ?? null,
    employment_type: (raw.employment_type as string) ?? (raw.job_type as string) ?? null,
    employmentType: (raw.employment_type as string) ?? (raw.job_type as string) ?? null,
    department: (raw.department as string) ?? (raw.team as string) ?? null,
    listing_date: (raw.listing_date as string) ?? (raw.date_posted as string) ?? (raw.posted_date as string) ?? null,
    listingDate: (raw.listing_date as string) ?? (raw.date_posted as string) ?? (raw.posted_date as string) ?? null,
    job_description_excerpt: excerpt,
    jobDescriptionExcerpt: excerpt,
    source_url: validUrl,
    sourceUrl: validUrl,
    collected_at: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    is_fixture: Boolean(raw.is_fixture),
    isFixture: Boolean(raw.is_fixture),
    github_owner: matchedCompany?.githubOwner,
    githubOwner: matchedCompany?.githubOwner,
    candidate_repositories: matchedCompany?.candidateRepositories ? [...matchedCompany.candidateRepositories] : undefined,
    candidateRepositories: matchedCompany?.candidateRepositories ? [...matchedCompany.candidateRepositories] : undefined,
  };

  const validated = NormalizedJobResultSchema.safeParse(candidate);
  return validated.success ? validated.data : null;
}

/**
 * Deduplicates job records by normalized company ID/name + normalized job title + source URL.
 */
export function deduplicateJobRecords(records: NormalizedJobResult[]): NormalizedJobResult[] {
  const seen = new Set<string>();
  const deduplicated: NormalizedJobResult[] = [];

  for (const record of records) {
    const compKey = record.company_id || normalizeCompanyName(record.company_name);
    const normTitle = normalizeJobTitle(record.role_title);
    const cleanUrl = (record.source_url || '').trim().toLowerCase();

    const dedupKey = `${compKey}|${normTitle}|${cleanUrl}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      deduplicated.push(record);
    }
  }

  return deduplicated;
}

const ENGINEERING_TITLE_REGEX =
  /(engineer|developer|architect|lead|full[ -]?stack|frontend|front[ -]?end|backend|back[ -]?end|platform|devops|sre|software|programmer|systems|coder)/i;

/**
 * Deterministically scores and ranks job records against the selected stack.
 *
 * Scoring breakdown (0 - 100):
 * - Base validation: 20 pts
 * - Target stack keyword matches: up to 35 pts (+20 for primary match, +15 for additional matches)
 * - Engineering title relevance: +20 pts
 * - Source completeness: up to 15 pts (valid source url +5, location +3, full description +7)
 * - Listing recency: up to 10 pts
 */
export function scoreAndRankJobRecords(
  records: NormalizedJobResult[],
  stack: string[]
): NormalizedJobResult[] {
  const cleanStack = (stack || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const stackRegexes = cleanStack.map((tech) => ({
    tech,
    // Escape special regex chars like '+' in 'C++' or '.' in 'Node.js'
    regex: new RegExp(
      tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    ),
  }));

  const scoredRecords: NormalizedJobResult[] = records.map((record) => {
    let score = 20; // Base score for valid job opportunity
    const reasons: string[] = [];

    const searchableText = `${record.role_title} ${record.department || ''} ${
      record.job_description_excerpt || ''
    }`;

    // 1. Stack keyword matches
    const matchedTechs: string[] = [];
    for (const { tech, regex } of stackRegexes) {
      if (regex.test(searchableText)) {
        matchedTechs.push(tech);
      }
    }

    if (matchedTechs.length > 0) {
      const matchScore = 20 + Math.min(15, (matchedTechs.length - 1) * 7.5);
      score += matchScore;
      reasons.push(`Matches target stack (${matchedTechs.join(', ')})`);
    } else {
      reasons.push('General engineering opportunity matching target domain');
    }

    // 2. Title relevance
    if (ENGINEERING_TITLE_REGEX.test(record.role_title)) {
      score += 20;
      reasons.push(`Relevant engineering title: "${record.role_title}"`);
    }

    // 3. Source completeness
    let completenessPoints = 0;
    if (record.source_url && !record.source_url.includes('example.com')) {
      completenessPoints += 5;
    }
    if (record.location) {
      completenessPoints += 3;
    }
    if (record.job_description_excerpt && record.job_description_excerpt.length >= 30) {
      completenessPoints += 7;
      reasons.push('Complete source description and requirements available');
    } else {
      reasons.push('Direct source listing verified');
    }
    score += completenessPoints;

    // 4. Recency evaluation (if date is present)
    if (record.listing_date) {
      const parsedDate = Date.parse(record.listing_date);
      if (!isNaN(parsedDate)) {
        const daysDiff = (Date.now() - parsedDate) / (1000 * 60 * 60 * 24);
        if (daysDiff >= 0 && daysDiff <= 30) {
          score += 10;
          reasons.push(`Recent posting (within 30 days: ${record.listing_date})`);
        } else if (daysDiff > 30 && daysDiff <= 90) {
          score += 5;
          reasons.push(`Active listing posted ${record.listing_date}`);
        } else {
          score += 3;
        }
      } else {
        score += 3;
      }
    }

    const finalScore = Math.min(100, Math.max(0, Math.round(score)));

    return {
      ...record,
      score: finalScore,
      reasons: reasons.length > 0 ? reasons : ['Verified public job posting'],
    };
  });

  // Sort deterministically: highest score first, then stable tie-breakers
  return scoredRecords.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const companyDiff = a.company_name.localeCompare(b.company_name);
    if (companyDiff !== 0) return companyDiff;

    const roleDiff = a.role_title.localeCompare(b.role_title);
    if (roleDiff !== 0) return roleDiff;

    return a.source_url.localeCompare(b.source_url);
  });
}

/**
 * Selects a diverse top subset of jobs (default top 5, max 2 per company when other companies have eligible jobs).
 */
export function selectDiverseTopJobs(
  rankedRecords: NormalizedJobResult[],
  maxTotal: number = 5,
  maxPerCompany: number = 2
): NormalizedJobResult[] {
  if (rankedRecords.length === 0) return [];

  const selected: NormalizedJobResult[] = [];
  const companyCounts = new Map<string, number>();
  const deferred: NormalizedJobResult[] = [];

  // Pass 1: pick in score order, respecting maxPerCompany
  for (const record of rankedRecords) {
    const compKey = (record.company_id || record.company_name || 'unknown').toLowerCase();
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

/**
 * End-to-end normalization, deduplication, scoring, and ranking pipeline for Bright Data records.
 * Returns all normalized records (preserved for "Show more") and the diverse top-5 subset.
 */
export function processAndRankJobRecords(
  rawRecords: unknown[],
  stack: string[],
  fallbackSeedUrl?: string
): {
  allResults: NormalizedJobResult[];
  topResults: NormalizedJobResult[];
} {
  const normalized: NormalizedJobResult[] = [];

  for (const item of rawRecords) {
    const record = normalizeRawJobRecord(item, fallbackSeedUrl);
    if (record) {
      normalized.push(record);
    }
  }

  const deduplicated = deduplicateJobRecords(normalized);
  const ranked = scoreAndRankJobRecords(deduplicated, stack);
  const topResults = selectDiverseTopJobs(ranked, 5, 2);

  return {
    allResults: ranked,
    topResults,
  };
}

