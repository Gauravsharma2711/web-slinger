import {
  NormalizedJobResult,
  NormalizedJobResultSchema,
  BrightDataRawRecordSchema,
  CompactHealthRecord,
} from '@web-slinger/shared';
import { config, brightDataConfig } from '../config.js';
import { BrightDataClient } from './brightDataClient.js';

export interface ResearchAdapterResult {
  status: 'completed' | 'degraded' | 'failed';
  results: NormalizedJobResult[];
  message: string;
  snapshotId?: string | null;
  health: CompactHealthRecord;
  errorCategory?: string;
}

export interface ResearchAdapter {
  executeResearch(
    sessionId: string,
    stack: string[],
    goal?: string | null,
    existingSnapshotId?: string | null,
    onSnapshotTriggered?: (snapshotId: string) => Promise<void>
  ): Promise<ResearchAdapterResult>;
}

/**
 * Fixture research adapter used when DEMO_MODE=true or as fallback during demo mode.
 * Returns clearly labelled fixture results and NEVER calls external services.
 */
export class FixtureResearchAdapter implements ResearchAdapter {
  async executeResearch(
    _sessionId: string,
    stack: string[],
    goal?: string | null
  ): Promise<ResearchAdapterResult> {
    const primaryTech = stack[0] || 'TypeScript';
    const now = new Date().toISOString();

    const fixtureResult: NormalizedJobResult = {
      company_name: `[DEMO FIXTURE] ${primaryTech} Core Labs`,
      role_title: `Senior ${primaryTech} Platform Engineer`,
      location: 'Remote (Global)',
      employment_type: 'Full-time',
      department: 'Developer Infrastructure',
      listing_date: '2026-08-20',
      job_description_excerpt: `[DEMO FIXTURE] Seeking an experienced developer proficient in ${stack.join(
        ', '
      )} to contribute to core tooling and public packages.${goal ? ` Goal alignment: ${goal}` : ''}`,
      source_url: 'https://demo.web-slinger.local/fixtures/jobs/1',
      collected_at: now,
      is_fixture: true,
    };

    return {
      status: 'completed',
      results: [fixtureResult],
      message: 'Fixture research completed with demo results',
      snapshotId: 'fixture_snapshot_123',
      health: {
        status: 'healthy',
        message: 'Demo mode fixture data loaded successfully',
        timestamp: now,
      },
    };
  }
}

/**
 * Live Bright Data research adapter.
 * Uses DCA trigger -> exponential backoff dataset polling -> Zod normalization flow.
 */
export class BrightDataResearchAdapter implements ResearchAdapter {
  private client: BrightDataClient;
  private fixtureAdapter: FixtureResearchAdapter;

  constructor(client: BrightDataClient = new BrightDataClient()) {
    this.client = client;
    this.fixtureAdapter = new FixtureResearchAdapter();
  }

  async executeResearch(
    sessionId: string,
    stack: string[],
    goal?: string | null,
    existingSnapshotId?: string | null,
    onSnapshotTriggered?: (snapshotId: string) => Promise<void>
  ): Promise<ResearchAdapterResult> {
    const now = new Date().toISOString();

    // 1. DEMO_MODE: always return clearly labelled fixture result with completed status
    if (config.demoMode) {
      const fixtureRes = await this.fixtureAdapter.executeResearch(sessionId, stack, goal);
      return {
        ...fixtureRes,
        status: 'completed',
        health: {
          status: 'healthy',
          message: 'Demo mode fixture data loaded successfully',
          timestamp: now,
        },
      };
    }

    // 2. Validate typed immutable Bright Data configuration object
    const cfg = this.client.activeConfig;
    const hasToken = Boolean(cfg.apiToken && cfg.apiToken.length > 0);
    const hasCollector = Boolean(cfg.collectorId && cfg.collectorId.length > 0);
    const hasSeedUrls = cfg.seedUrls.length > 0;

    if (!hasToken || !hasCollector || !hasSeedUrls) {
      const missing: string[] = [];
      if (!hasToken) missing.push('BRIGHT_DATA_API_TOKEN');
      if (!hasCollector) missing.push('BRIGHT_DATA_JOB_COLLECTOR_ID');
      if (!hasSeedUrls) missing.push('RESEARCH_SEED_URLS');

      const safeMessage = `Public job collector is unconfigured (${missing.join(
        ', '
      )} missing). Session preserved in degraded state.`;
      console.warn(`[BrightDataResearchAdapter] Missing environment config: ${missing.join(', ')}`);

      return {
        status: 'degraded',
        results: [],
        message: safeMessage,
        errorCategory: 'MISSING_CONFIG',
        health: {
          status: 'degraded',
          message: safeMessage,
          timestamp: now,
        },
      };
    }

    // Validate collector ID prefix
    if (!cfg.collectorId.startsWith('c_')) {
      const safeMessage =
        'Public job collector ID is invalid (must start with c_). Session preserved in degraded state.';
      console.warn('[BrightDataResearchAdapter] Invalid collector ID prefix');

      return {
        status: 'degraded',
        results: [],
        message: safeMessage,
        errorCategory: 'INVALID_CONFIG',
        health: {
          status: 'degraded',
          message: safeMessage,
          timestamp: now,
        },
      };
    }

    let collectionId = existingSnapshotId ?? null;

    try {
      const seedUrls = cfg.seedUrls;

      // If no existing snapshot to resume, trigger a new collection
      if (!collectionId) {
        const triggerInputs = seedUrls.map((url) => ({
          url,
        }));

        collectionId = await this.client.triggerCollection(triggerInputs);

        // Immediately persist snapshot ID hook
        if (onSnapshotTriggered && collectionId) {
          await onSnapshotTriggered(collectionId).catch((err) => {
            console.warn('[BrightDataResearchAdapter] onSnapshotTriggered callback failed:', err);
          });
        }
      } else {
        console.log(
          `[BrightDataResearchAdapter] Resuming existing snapshot: j_***${collectionId.slice(
            -6
          )} for session ...${sessionId.slice(-6)}`
        );
      }

      // Step 3: Poll dataset with bounded exponential backoff
      const rawRecords = await this.client.pollSnapshot(collectionId, { sessionId });

      // Step 4, 5, 6: Validate with Zod and normalize approved fields
      const normalizedResults: NormalizedJobResult[] = [];

      for (const item of rawRecords) {
        const parseResult = BrightDataRawRecordSchema.safeParse(item);
        if (!parseResult.success) {
          continue;
        }

        const raw = parseResult.data;
        const companyName =
          raw.company_name ||
          raw.company ||
          raw.employer_name ||
          raw.organization ||
          `${stack[0] || 'Tech'} Enterprise`;
        const roleTitle =
          raw.role_title ||
          raw.job_title ||
          raw.title ||
          raw.position ||
          'Software Engineer';

        // Preserve original source URL
        const sourceUrl =
          raw.source_url ||
          raw.url ||
          raw.link ||
          raw.apply_url ||
          seedUrls[0] ||
          'https://brightdata.com/datasets';

        // Sanitize and slice description excerpt
        const rawExcerpt =
          raw.job_description_excerpt ||
          raw.description ||
          raw.job_description ||
          raw.summary ||
          null;
        const excerpt = rawExcerpt ? rawExcerpt.slice(0, 500) : null;

        const candidateResult = {
          company_name: companyName,
          role_title: roleTitle,
          location: raw.location ?? raw.job_location ?? null,
          employment_type: raw.employment_type ?? raw.job_type ?? null,
          department: raw.department ?? raw.team ?? null,
          listing_date: raw.listing_date ?? raw.date_posted ?? raw.posted_date ?? null,
          job_description_excerpt: excerpt,
          source_url: sourceUrl,
          collected_at: new Date().toISOString(),
          is_fixture: false,
        };

        const validated = NormalizedJobResultSchema.safeParse(candidateResult);
        if (validated.success) {
          normalizedResults.push(validated.data);
        }
      }

      const hasResults = normalizedResults.length > 0;
      const status: 'completed' | 'degraded' = hasResults ? 'completed' : 'degraded';
      const message = hasResults
        ? `Successfully collected and normalized ${normalizedResults.length} job opportunities`
        : 'Collector completed but returned no matching records for the target stack';

      return {
        status,
        results: normalizedResults,
        message,
        snapshotId: collectionId,
        health: {
          status: hasResults ? 'healthy' : 'degraded',
          message,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown collector error';
      console.warn(`[BrightDataResearchAdapter] Collection degraded/failed: ${errorMsg}`);

      // Fallback behavior:
      // If DEMO_MODE=true: return clearly labelled fixture result
      if (config.demoMode) {
        const fixtureRes = await this.fixtureAdapter.executeResearch(sessionId, stack, goal);
        return {
          ...fixtureRes,
          status: 'completed',
          health: {
            status: 'degraded',
            message: 'Public collector failed; demo fixture fallback active',
            timestamp: now,
          },
        };
      }

      // If DEMO_MODE=false: return retryable degraded state; NEVER fabricate data; retain snapshotId
      return {
        status: 'degraded',
        results: [],
        message: `Public job collector in progress or timed out: ${errorMsg}`,
        snapshotId: collectionId,
        errorCategory: 'UPSTREAM_POLL_TIMEOUT',
        health: {
          status: 'degraded',
          message: `Public job collector in progress or timed out: ${errorMsg}`,
          timestamp: now,
        },
      };
    }
  }
}

export function createDefaultResearchAdapter(): ResearchAdapter {
  if (config.demoMode && !brightDataConfig.isConfigured) {
    return new FixtureResearchAdapter();
  }
  return new BrightDataResearchAdapter();
}
