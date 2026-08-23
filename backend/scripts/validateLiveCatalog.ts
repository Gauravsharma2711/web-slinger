import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Ensure DEMO_MODE is explicitly false for this live run
const backendEnvPath = path.resolve(process.cwd(), 'backend/.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
}
process.env.DEMO_MODE = 'false';

import { COMPANY_CATALOG, getAllCatalogSeedUrls, findCompanyByUrl, findCompanyByName } from '../src/companyCatalog.js';
import { BrightDataClient } from '../src/services/brightDataClient.js';
import { processAndRankJobRecords } from '../src/services/jobTriage.js';
import { config, brightDataConfig } from '../src/config.js';

interface CompanyLiveOutcome {
  companyName: string;
  seedHostname: string;
  status: 'completed' | 'degraded' | 'failed';
  normalizedJobCount: number;
  exampleTitles: string[];
  zeroJobReason: string | null;
  snapshotSuffix: string;
  failureCategory:
    | 'NONE'
    | 'TRIGGER_ERROR'
    | 'POLLING_TIMEOUT'
    | 'SCRAPE_EMPTY'
    | 'PARSER_MISMATCH'
    | 'COMPANY_ATTRIBUTION_MISMATCH'
    | 'COLLECTOR_UNCONFIGURED';
}

async function runLiveValidation() {
  console.log('--- Starting Live Multi-Company Bright Data Validation ---');
  console.log(`DEMO_MODE: ${process.env.DEMO_MODE || config.demoMode}`);
  console.log(`Collector Configured: ${brightDataConfig.isConfigured}`);
  console.log(`Collector Prefix: ${brightDataConfig.collectorPrefix}`);
  console.log(`Collector Fingerprint: ${brightDataConfig.collectorFingerprint}`);
  console.log(`Token Fingerprint: ${brightDataConfig.tokenFingerprint}`);

  const seedUrls = getAllCatalogSeedUrls();
  console.log(`Catalog Seed URLs (${seedUrls.length}):`, seedUrls.map((u) => new URL(u).hostname));

  const client = new BrightDataClient();
  const triggerInputs = seedUrls.map((url) => ({ url }));

  let snapshotId: string | null = null;
  let snapshotSuffix = 'none';
  let rawRecords: unknown[] = [];
  let triggerError: Error | null = null;
  let pollError: Error | null = null;

  if (!brightDataConfig.isConfigured) {
    console.error('Bright Data is not configured with valid token or c_-prefixed collector ID.');
  } else {
    try {
      console.log(`Triggering exactly 1 batch for all ${seedUrls.length} catalog career URLs...`);
      snapshotId = await client.triggerCollection(triggerInputs);
      snapshotSuffix = snapshotId.slice(-6);
      console.log(`Batch triggered successfully! Snapshot ID suffix: ...${snapshotSuffix}`);
    } catch (err) {
      triggerError = err instanceof Error ? err : new Error(String(err));
      console.error(`Trigger error: ${triggerError.message}`);
    }

    if (snapshotId) {
      try {
        console.log(`Polling snapshot ...${snapshotSuffix} with resilient exponential backoff (5m deadline)...`);
        rawRecords = await client.pollSnapshot(snapshotId, { sessionId: 'live-val-001' });
        console.log(`Poll finished! Received ${rawRecords.length} raw records.`);
      } catch (err) {
        pollError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Polling degraded/timed out: ${pollError.message}`);
      }
    }
  }

  // Process raw records through normalization, attribution, and ranking pipeline
  const { allResults } = processAndRankJobRecords(rawRecords, ['TypeScript', 'JavaScript', 'Go', 'Python'], seedUrls[0]);

  // Group normalized results by catalog company
  const outcomes: CompanyLiveOutcome[] = COMPANY_CATALOG.map((company) => {
    const seedHostname = new URL(company.careerUrl).hostname;
    const companyJobs = allResults.filter((j) => j.company_id === company.id || j.company_name === company.name);
    const exampleTitles = companyJobs.slice(0, 2).map((j) => j.role_title);

    let status: 'completed' | 'degraded' | 'failed' = 'completed';
    let zeroJobReason: string | null = null;
    let failureCategory: CompanyLiveOutcome['failureCategory'] = 'NONE';

    if (companyJobs.length === 0) {
      status = 'degraded';
      if (!brightDataConfig.isConfigured) {
        failureCategory = 'COLLECTOR_UNCONFIGURED';
        zeroJobReason = 'Bright Data credentials/collector unconfigured in active environment';
      } else if (triggerError) {
        failureCategory = 'TRIGGER_ERROR';
        status = 'failed';
        zeroJobReason = `Trigger call failed: ${triggerError.message}`;
      } else if (pollError) {
        failureCategory = 'POLLING_TIMEOUT';
        zeroJobReason = `Polling timed out before completion: ${pollError.message}`;
      } else if (rawRecords.length === 0) {
        failureCategory = 'SCRAPE_EMPTY';
        zeroJobReason = 'Scraper returned 0 raw records for this company seed';
      } else {
        // Raw records were returned, but none normalized to this company
        const unAttributedForHost = rawRecords.filter((r) => {
          const rec = r as Record<string, unknown>;
          const u = String(rec.url || rec.link || rec.source_url || '');
          return u.includes(seedHostname);
        });

        if (unAttributedForHost.length > 0) {
          failureCategory = 'PARSER_MISMATCH';
          zeroJobReason = `${unAttributedForHost.length} raw records matched host but failed schema validation/parsing`;
        } else {
          failureCategory = 'COMPANY_ATTRIBUTION_MISMATCH';
          zeroJobReason = 'Raw dataset contained records from other seeds, but none for this company seed';
        }
      }
    }

    return {
      companyName: company.name,
      seedHostname,
      status,
      normalizedJobCount: companyJobs.length,
      exampleTitles,
      zeroJobReason,
      snapshotSuffix,
      failureCategory,
    };
  });

  console.log('\n================ SAFE PER-COMPANY REPORT ================');
  console.table(
    outcomes.map((o) => ({
      'Company Name': o.companyName,
      'Seed Hostname': o.seedHostname,
      'Collection Status': o.status,
      'Normalized Jobs': o.normalizedJobCount,
      'Example Titles': o.exampleTitles.join(', ') || 'N/A',
      'Zero Job Reason': o.zeroJobReason || 'N/A',
      'Failure Category': o.failureCategory,
      'Snapshot Suffix': `...${o.snapshotSuffix}`,
    }))
  );
  console.log('=========================================================\n');
}

runLiveValidation().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
