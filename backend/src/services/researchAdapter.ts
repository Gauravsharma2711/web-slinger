import {
  NormalizedJobResult,
  NormalizedJobResultSchema,
  CompactHealthRecord,
  getCuratedDemoFixtures,
} from '@web-slinger/shared';
import { config, brightDataConfig } from '../config.js';
import { BrightDataClient } from './brightDataClient.js';
import { processAndRankJobRecords, selectDiverseTopJobs } from './jobTriage.js';

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
 * Fixture research adapter for deterministic offline demo mode.
 * Returns clearly labelled fixture results and NEVER calls external services.
 */
export class FixtureResearchAdapter implements ResearchAdapter {
  async executeResearch(
    _sessionId: string,
    stack: string[],
    goal?: string | null
  ): Promise<ResearchAdapterResult> {
    const now = new Date().toISOString();
    const rawFixtures = getCuratedDemoFixtures(stack, goal);
    const parsedFixtures: NormalizedJobResult[] = [];

    for (const raw of rawFixtures) {
      const parsed = NormalizedJobResultSchema.safeParse(raw);
      if (parsed.success) {
        parsedFixtures.push(parsed.data);
      }
    }

    const diverseFixtures = selectDiverseTopJobs(parsedFixtures, 5, 2);

    return {
      status: 'completed',
      results: diverseFixtures,
      message: 'Fixture research completed with curated demo results',
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

    // 1. DEMO_MODE fallback when client is unconfigured
    if (config.demoMode && !this.client.isConfigured) {
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

      // Step 4: Normalize, deduplicate, score, and rank records deterministically
      const { allResults } = processAndRankJobRecords(rawRecords, stack, seedUrls[0]);

      const hasResults = allResults.length > 0;
      const status: 'completed' | 'degraded' = hasResults ? 'completed' : 'degraded';
      const message = hasResults
        ? `Successfully collected, ranked, and normalized ${allResults.length} job opportunities`
        : 'Collector completed but returned no matching records for the target stack';

      return {
        status,
        results: allResults,
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
      // If DEMO_MODE=true AND client is not configured: return clearly labelled fixture result
      if (config.demoMode && !this.client.isConfigured) {
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

import { GrafanaGreenhouseAdapter } from './grafanaGreenhouseAdapter.js';

export function createDefaultResearchAdapter(): ResearchAdapter {
  if (config.demoMode) {
    return new FixtureResearchAdapter();
  }
  return new GrafanaGreenhouseAdapter();
}
