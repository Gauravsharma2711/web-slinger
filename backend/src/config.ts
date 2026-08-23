import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

import { getAllCatalogSeedUrls } from '@web-slinger/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In local development, load exactly backend/.env relative to the backend package with override: true
// so local development is deterministic and not corrupted by stale process/shell variables.
const isProduction = process.env.NODE_ENV === 'production';
const backendEnvPath = path.resolve(__dirname, '../.env');

let envLoaded = false;
if (!isProduction && fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true });
  envLoaded = true;
} else if (!isProduction) {
  // Fallback to workspace path if running in alternate structure
  const rootBackendEnvPath = path.resolve(process.cwd(), 'backend/.env');
  if (fs.existsSync(rootBackendEnvPath)) {
    dotenv.config({ path: rootBackendEnvPath, override: true });
    envLoaded = true;
  }
}

export function computeSha256Fingerprint(val: string): string {
  if (!val || !val.trim()) return 'none';
  return crypto.createHash('sha256').update(val.trim()).digest('hex').slice(0, 8);
}

const parseSeedUrls = (raw?: string): string[] => {
  if (!raw || !raw.trim()) return getAllCatalogSeedUrls();
  try {
    if (raw.trim().startsWith('[')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.map((s) => String(s).trim()).filter(Boolean);
        return list.length > 0 ? list : getAllCatalogSeedUrls();
      }
    }
  } catch {
    // Fall back to comma separation
  }
  const split = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return split.length > 0 ? split : getAllCatalogSeedUrls();
};

const rawDemoMode = (process.env.DEMO_MODE || '').trim().toLowerCase();
const isDemoMode = rawDemoMode === 'true';

const ConfigSchema = z.object({
  nodeEnv: z.string().default(process.env.NODE_ENV || 'development'),
  port: z.coerce.number().default(8080),
  googleCloudProject: z.string().optional().default(process.env.GOOGLE_CLOUD_PROJECT || ''),
  googleCloudLocation: z.string().default(process.env.GOOGLE_CLOUD_LOCATION || 'global'),
  geminiModelId: z.string().default(process.env.GEMINI_MODEL_ID || 'gemini-3.7-flash'),
  firestoreCollection: z.string().default(process.env.FIRESTORE_COLLECTION || 'sessions'),
  corsOrigin: z.string().default('http://localhost:5173'),
  demoMode: z.boolean().default(isDemoMode),
  brightDataApiToken: z.string().default(process.env.BRIGHT_DATA_API_TOKEN || ''),
  brightDataJobCollectorId: z.string().default(process.env.BRIGHT_DATA_JOB_COLLECTOR_ID || ''),
  researchSeedUrls: z.array(z.string()).default(parseSeedUrls(process.env.RESEARCH_SEED_URLS)),
  githubTargetOwner: z.string().default(process.env.GITHUB_TARGET_OWNER || ''),
  githubTargetRepo: z.string().default(process.env.GITHUB_TARGET_REPO || ''),
  githubToken: z.string().default(process.env.GITHUB_TOKEN || ''),
  githubApiVersion: z.string().default(process.env.GITHUB_API_VERSION || '2022-11-28'),
  githubIssuesPageSize: z.coerce.number().default(Number(process.env.GITHUB_ISSUES_PAGE_SIZE) || 30),
  githubMaxIssues: z.coerce.number().default(Number(process.env.GITHUB_MAX_ISSUES) || 30),
  useInMemoryRepo: z.boolean().default(
    process.env.USE_IN_MEMORY_REPO === 'true' || process.env.NODE_ENV === 'test'
  ),
});

export const config = ConfigSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION,
  geminiModelId: process.env.GEMINI_MODEL_ID,
  firestoreCollection: process.env.FIRESTORE_COLLECTION,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  demoMode: isDemoMode,
  brightDataApiToken: process.env.BRIGHT_DATA_API_TOKEN || '',
  brightDataJobCollectorId: process.env.BRIGHT_DATA_JOB_COLLECTOR_ID || '',
  researchSeedUrls: parseSeedUrls(process.env.RESEARCH_SEED_URLS),
  githubTargetOwner: process.env.GITHUB_TARGET_OWNER || '',
  githubTargetRepo: process.env.GITHUB_TARGET_REPO || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  githubApiVersion: process.env.GITHUB_API_VERSION || '2022-11-28',
  githubIssuesPageSize: process.env.GITHUB_ISSUES_PAGE_SIZE
    ? Number(process.env.GITHUB_ISSUES_PAGE_SIZE)
    : 30,
  githubMaxIssues: process.env.GITHUB_MAX_ISSUES
    ? Number(process.env.GITHUB_MAX_ISSUES)
    : 30,
  useInMemoryRepo:
    process.env.USE_IN_MEMORY_REPO === 'true' || process.env.NODE_ENV === 'test',
});

// Log demoMode safely at startup (never log raw secrets)
console.log(`[Config] demoMode: ${config.demoMode}`);

// Immutable typed Bright Data configuration object constructed once at startup
export interface BrightDataConfig {
  readonly apiToken: string;
  readonly collectorId: string;
  readonly seedUrls: readonly string[];
  readonly isConfigured: boolean;
  readonly tokenFingerprint: string;
  readonly collectorFingerprint: string;
  readonly collectorPrefix: string;
  readonly collectorLength: number;
}

const token = config.brightDataApiToken.trim();
const collectorId = config.brightDataJobCollectorId.trim();

export const brightDataConfig: BrightDataConfig = Object.freeze({
  apiToken: token,
  collectorId: collectorId,
  seedUrls: Object.freeze([...config.researchSeedUrls]),
  isConfigured: Boolean(token.length > 0 && collectorId.startsWith('c_')),
  tokenFingerprint: computeSha256Fingerprint(token),
  collectorFingerprint: computeSha256Fingerprint(collectorId),
  collectorPrefix: collectorId.slice(0, 2),
  collectorLength: collectorId.length,
});

// Immutable typed GitHub configuration object constructed once at startup
export interface GitHubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly token: string;
  readonly apiVersion: string;
  readonly pageSize: number;
  readonly maxIssues: number;
  readonly isConfigured: boolean;
  readonly tokenPresent: boolean;
  readonly tokenFingerprint: string;
}

const ghToken = config.githubToken.trim();
const ghOwner = config.githubTargetOwner.trim();
const ghRepo = config.githubTargetRepo.trim();

export const githubConfig: GitHubConfig = Object.freeze({
  owner: ghOwner,
  repo: ghRepo,
  token: ghToken,
  apiVersion: config.githubApiVersion.trim() || '2022-11-28',
  pageSize: Math.min(Math.max(1, config.githubIssuesPageSize), 100),
  maxIssues: Math.max(1, config.githubMaxIssues),
  isConfigured: Boolean(ghOwner.length > 0 && ghRepo.length > 0),
  tokenPresent: Boolean(ghToken.length > 0),
  tokenFingerprint: computeSha256Fingerprint(ghToken),
});

// Safe configuration fingerprint log on startup (no secrets or full tokens logged)
console.log(
  `[BrightDataConfig] envLoaded: ${envLoaded} | tokenPresent: ${Boolean(
    brightDataConfig.apiToken
  )} | tokenFingerprint: ${brightDataConfig.tokenFingerprint} | collectorPrefix: ${
    brightDataConfig.collectorPrefix
  } | collectorLength: ${brightDataConfig.collectorLength} | collectorFingerprint: ${
    brightDataConfig.collectorFingerprint
  } | seedUrlCount: ${brightDataConfig.seedUrls.length}`
);

console.log(
  `[GitHubConfig] envLoaded: ${envLoaded} | owner: ${githubConfig.owner || 'none'} | repo: ${
    githubConfig.repo || 'none'
  } | tokenPresent: ${githubConfig.tokenPresent} | tokenFingerprint: ${
    githubConfig.tokenFingerprint
  } | apiVersion: ${githubConfig.apiVersion} | pageSize: ${githubConfig.pageSize} | maxIssues: ${
    githubConfig.maxIssues
  }`
);

export type Config = z.infer<typeof ConfigSchema>;
