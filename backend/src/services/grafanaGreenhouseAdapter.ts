import {
  NormalizedJobResult,
} from '@web-slinger/shared';
import { ResearchAdapter, ResearchAdapterResult } from './researchAdapter.js';

interface GreenhouseJobRaw {
  id: number | string;
  title: string;
  location?: { name?: string };
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
}

interface GreenhouseResponseRaw {
  jobs?: GreenhouseJobRaw[];
}

interface CacheEntry {
  timestamp: number;
  retrievedAtIso: string;
  jobs: GreenhouseJobRaw[];
}

let cachedGreenhouseJobs: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class GrafanaGreenhouseAdapter implements ResearchAdapter {
  // Lightweight list endpoint without heavy ?content=true
  private apiUrl = 'https://boards-api.greenhouse.io/v1/boards/grafanalabs/jobs';
  private timeoutMs = 10000; // 10 seconds

  async executeResearch(
    _sessionId: string,
    stack: string[],
    _goal?: string | null,
    _existingSnapshotId?: string | null,
    _onSnapshotTriggered?: (snapshotId: string) => Promise<void>
  ): Promise<ResearchAdapterResult> {
    const startTime = Date.now();
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();

    let rawJobs: GreenhouseJobRaw[] = [];
    let isCached = false;
    let retrievalTimeIso = nowIso;
    let httpStatus: number | null = null;
    let contentLength: string | null = null;
    let errorInfo: { errorClass: string; errorMessage: string } | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(this.apiUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Web-Slinger/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      httpStatus = res.status;
      contentLength = res.headers.get('content-length');

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as GreenhouseResponseRaw;
      if (!data || !Array.isArray(data.jobs)) {
        throw new Error('Invalid response structure: expected jobs array');
      }

      rawJobs = data.jobs;

      // Update in-memory cache
      cachedGreenhouseJobs = {
        timestamp: startTime,
        retrievedAtIso: nowIso,
        jobs: rawJobs,
      };
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      errorInfo = {
        errorClass: errorObj.name || 'Error',
        errorMessage: errorObj.message || 'Unknown network error',
      };

      // Check for valid cache entry
      if (cachedGreenhouseJobs && nowMs - cachedGreenhouseJobs.timestamp < CACHE_TTL_MS && cachedGreenhouseJobs.jobs.length > 0) {
        rawJobs = cachedGreenhouseJobs.jobs;
        isCached = true;
        retrievalTimeIso = cachedGreenhouseJobs.retrievedAtIso;
      }
    }

    const elapsedMs = Date.now() - startTime;
    const isArray = Array.isArray(rawJobs);
    const totalRealJobs = rawJobs.length;

    // Evaluate states
    if (errorInfo && !isCached) {
      console.log(
        JSON.stringify({
          source: 'boards-api.greenhouse.io/v1/boards/grafanalabs/jobs',
          httpStatus,
          elapsedMs,
          contentLength,
          isArray,
          totalRealJobs: 0,
          exactStackMatches: 0,
          fallbackTechnicalRoles: 0,
          state: 'source_unavailable',
          errorClass: errorInfo.errorClass,
          errorMessage: errorInfo.errorMessage,
        })
      );

      return {
        status: 'degraded',
        results: [],
        message: 'Live roles from Grafana Labs are temporarily unavailable. Try again shortly.',
        health: {
          status: 'degraded',
          message: 'Live roles from Grafana Labs are temporarily unavailable. Try again shortly.',
          timestamp: nowIso,
        },
      };
    }

    if (totalRealJobs === 0) {
      console.log(
        JSON.stringify({
          source: 'boards-api.greenhouse.io/v1/boards/grafanalabs/jobs',
          httpStatus,
          elapsedMs,
          contentLength,
          isArray: true,
          totalRealJobs: 0,
          exactStackMatches: 0,
          fallbackTechnicalRoles: 0,
          state: 'no_live_jobs',
        })
      );

      return {
        status: 'completed',
        results: [],
        message: 'No open jobs currently listed on Grafana Labs public job board.',
        health: {
          status: 'healthy',
          message: 'Public board returned 0 active listings',
          timestamp: nowIso,
        },
      };
    }

    // Normalize and rank real returned jobs
    const { normalized, exactMatchCount, fallbackCount, state } = this.normalizeAndRankJobs(
      rawJobs,
      stack,
      retrievalTimeIso
    );

    console.log(
      JSON.stringify({
        source: 'boards-api.greenhouse.io/v1/boards/grafanalabs/jobs',
        httpStatus: httpStatus || 200,
        elapsedMs,
        contentLength,
        isArray: true,
        totalRealJobs,
        exactStackMatches: exactMatchCount,
        fallbackTechnicalRoles: fallbackCount,
        cached: isCached,
        state,
      })
    );

    return {
      status: 'completed',
      results: normalized,
      message: isCached
        ? 'Cached live roles from Grafana Labs'
        : 'Live roles from Grafana Labs loaded successfully',
      health: {
        status: 'healthy',
        message: isCached
          ? 'Loaded cached live roles from Grafana Labs'
          : 'Loaded live roles from Grafana Labs public job board',
        timestamp: nowIso,
      },
    };
  }

  private normalizeAndRankJobs(
    rawJobs: GreenhouseJobRaw[],
    stack: string[],
    retrievalTimeIso: string
  ): {
    normalized: NormalizedJobResult[];
    exactMatchCount: number;
    fallbackCount: number;
    state: 'exact_stack_matches' | 'no_exact_stack_match';
  } {
    const normalizedStack = stack.map((s) => s.trim().toLowerCase()).filter(Boolean);

    let exactMatchCount = 0;
    let fallbackCount = 0;

    const scoredJobs = rawJobs.map((job) => {
      const title = job.title || 'Software Engineer';
      const titleLower = title.toLowerCase();

      const matchedTerms: string[] = [];
      for (const term of normalizedStack) {
        if (titleLower.includes(term)) {
          matchedTerms.push(term);
        }
      }

      let score = 60;
      let reasons: string[] = [];

      if (matchedTerms.length > 0) {
        exactMatchCount++;
        score = Math.min(98, 75 + matchedTerms.length * 10);
        reasons = [
          `Matches stack requirements (${matchedTerms.join(', ')}) from live Grafana Labs job title`,
        ];
      } else {
        fallbackCount++;
        score = 60;
        reasons = ['Technical role from Grafana Labs public job board'];
      }

      const normalizedJob: NormalizedJobResult = {
        job_id: `grafana-greenhouse-${job.id}`,
        company_id: 'grafana',
        company_name: 'Grafana Labs',
        role_title: title,
        location: job.location?.name || 'Remote',
        department: 'Engineering',
        employment_type: 'Full-time',
        source_url: job.absolute_url,
        career_url: 'https://grafana.com/about/careers/',
        collected_at: retrievalTimeIso,
        listing_date: job.updated_at || job.first_published || null,
        job_description_excerpt: null,
        is_fixture: false,
        isFixture: false,
        score,
        reasons,
        candidate_repositories: ['grafana/grafana', 'grafana/loki', 'grafana/tempo', 'grafana/mimir'],
      };

      return normalizedJob;
    });

    // Deterministic sort: score desc, then title asc
    scoredJobs.sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.role_title.localeCompare(b.role_title);
    });

    const state = exactMatchCount > 0 ? 'exact_stack_matches' : 'no_exact_stack_match';

    return {
      normalized: scoredJobs.slice(0, 5),
      exactMatchCount,
      fallbackCount,
      state,
    };
  }
}
