import {
  brightDataConfig,
  BrightDataConfig,
  computeSha256Fingerprint,
} from '../config.js';

export interface BrightDataTriggerInput {
  url?: string;
  keyword?: string;
  search_term?: string;
  [key: string]: unknown;
}

export interface BrightDataClientOptions {
  config?: BrightDataConfig;
  apiToken?: string;
  collectorId?: string;
  baseUrl?: string;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  deadlineMs?: number;
  requestTimeoutMs?: number;
}

export interface PollSnapshotOptions {
  sessionId?: string;
  deadlineMs?: number;
}

export class BrightDataClient {
  private config: BrightDataConfig;
  private baseUrl: string;
  private initialDelayMs: number;
  private maxDelayMs: number;
  private backoffMultiplier: number;
  private deadlineMs: number;
  private requestTimeoutMs: number;

  constructor(options: BrightDataClientOptions = {}) {
    if (options.config) {
      this.config = options.config;
    } else if (options.apiToken !== undefined || options.collectorId !== undefined) {
      const token = (options.apiToken ?? brightDataConfig.apiToken).trim();
      const collectorId = (options.collectorId ?? brightDataConfig.collectorId).trim();
      this.config = Object.freeze({
        apiToken: token,
        collectorId: collectorId,
        seedUrls: brightDataConfig.seedUrls,
        isConfigured: Boolean(token.length > 0 && collectorId.startsWith('c_')),
        tokenFingerprint: computeSha256Fingerprint(token),
        collectorFingerprint: computeSha256Fingerprint(collectorId),
        collectorPrefix: collectorId.slice(0, 2),
        collectorLength: collectorId.length,
      });
    } else {
      this.config = brightDataConfig;
    }

    this.baseUrl = options.baseUrl ?? 'https://api.brightdata.com';
    this.initialDelayMs = options.initialDelayMs ?? 3000; // 3s initial backoff
    this.backoffMultiplier = options.backoffMultiplier ?? 1.5;
    this.maxDelayMs = options.maxDelayMs ?? 15000; // 15s max delay
    this.deadlineMs = options.deadlineMs ?? 300000; // 5 minutes overall deadline
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  }

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  get activeConfig(): BrightDataConfig {
    return this.config;
  }

  /**
   * Triggers DCA dataset collection on Bright Data.
   * Target endpoint: https://api.brightdata.com/dca/trigger?collector=<c-prefixed-id>&queue_next=1
   * Returns collection_id / response_id.
   */
  async triggerCollection(inputs: BrightDataTriggerInput[]): Promise<string> {
    if (!this.isConfigured) {
      throw new Error(
        'Bright Data client is not configured with valid token and c_-prefixed collector ID'
      );
    }

    const cleanCollectorId = this.config.collectorId.trim();
    const isInputArray = Array.isArray(inputs);
    const serializedBody = JSON.stringify(inputs);
    const bodyByteLength = Buffer.byteLength(serializedBody, 'utf8');

    const triggerUrl = `${this.baseUrl}/dca/trigger?collector=${cleanCollectorId}&queue_next=1`;
    const redactedUrl = `${this.baseUrl}/dca/trigger?collector=${this.config.collectorPrefix}***&queue_next=1`;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const safeHeadersLog = {
      Authorization: 'Bearer [redacted]',
      'Content-Type': requestHeaders['Content-Type'],
      Accept: requestHeaders['Accept'],
    };

    // Safe request-shape record log before fetch (no secrets or unredacted collector ID)
    console.log('[BrightDataClient] Outgoing Request Shape:', {
      method: 'POST',
      url: redactedUrl,
      headers: safeHeadersLog,
      body: serializedBody,
      bodyType: typeof inputs,
      isArray: isInputArray,
      bodyByteLength,
    });

    const res = await fetch(triggerUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: serializedBody,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') {
          responseHeaders[key] = value;
        }
      });

      console.error('[BrightDataClient] Non-2xx Response:', {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        responseBody: errorBody,
      });

      throw new Error(
        `Bright Data trigger failed with HTTP ${res.status} (${res.statusText}): ${errorBody || 'No response body'}`
      );
    }

    const data = (await res.json()) as {
      collection_id?: string;
      response_id?: string;
      snapshot_id?: string;
    };
    const collectionId = data.collection_id || data.response_id || data.snapshot_id;

    if (!collectionId) {
      throw new Error('Bright Data trigger did not return a valid collection/response ID');
    }

    return collectionId;
  }

  /**
   * Polls DCA dataset endpoint with bounded exponential backoff (3s -> 4.5s -> 6.75s -> 10s -> 15s capped)
   * until ready or overall deadline (5 minutes) is reached.
   * Endpoint: https://api.brightdata.com/dca/dataset?id=<snapshot_id>
   */
  async pollSnapshot(
    snapshotId: string,
    options: PollSnapshotOptions = {}
  ): Promise<unknown[]> {
    if (!this.isConfigured) {
      throw new Error(
        'Bright Data client is not configured with valid token and c_-prefixed collector ID'
      );
    }

    const cleanSnapshotId = snapshotId.trim();
    const sessionIdSuffix = options.sessionId ? options.sessionId.slice(-6) : 'unknown';
    const snapshotIdSuffix = cleanSnapshotId.slice(-6);
    const deadlineMs = options.deadlineMs ?? this.deadlineMs;

    const startTime = Date.now();
    let currentDelay = this.initialDelayMs;
    let attempt = 0;

    while (Date.now() - startTime < deadlineMs) {
      attempt++;
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

      // Support official dataset endpoint: GET /dca/dataset?id=<snapshot-id>
      const datasetUrl = `${this.baseUrl}/dca/dataset?id=${encodeURIComponent(cleanSnapshotId)}`;
      const redactedUrl = `${this.baseUrl}/dca/dataset?id=j_***${snapshotIdSuffix}`;

      let res: Response;
      let rawText = '';

      try {
        res = await fetch(datasetUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        rawText = await res.text().catch(() => '');
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(
          `[BrightDataClient] Poll Attempt #${attempt} (${elapsedSeconds}s): session ...${sessionIdSuffix} | snapshot ...${snapshotIdSuffix} | fetch error: ${errorMsg}`
        );
        const remainingTime = deadlineMs - (Date.now() - startTime);
        if (remainingTime <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(currentDelay, remainingTime)));
        currentDelay = Math.min(Math.round(currentDelay * this.backoffMultiplier), this.maxDelayMs);
        continue;
      }

      // Safe logging of every poll attempt
      const truncatedBody = rawText.length > 200 ? `${rawText.slice(0, 200)}...` : rawText;
      console.log(
        `[BrightDataClient] Poll Attempt #${attempt} (${elapsedSeconds}s): session ...${sessionIdSuffix} | snapshot ...${snapshotIdSuffix} | URL: ${redactedUrl} | status: ${res.status} ${res.statusText} | body: ${truncatedBody || '[empty]'}`
      );

      // HTTP 200: Dataset ready
      if (res.status === 200) {
        if (rawText && rawText.trim()) {
          try {
            const parsed = JSON.parse(rawText);
            // Check if it returned a status object (e.g. { status: 'running' })
            if (
              parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed) &&
              (parsed.status === 'running' || parsed.status === 'building' || parsed.status === 'collecting')
            ) {
              // Still running inside 200 wrapper
            } else {
              const records = Array.isArray(parsed) ? parsed : [parsed];
              if (records.length > 0) {
                return records;
              }
            }
          } catch {
            // Parse JSON Lines if output is NDJSON
            const lines = rawText
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length > 0) {
              const records = lines.map((l) => JSON.parse(l));
              return records;
            }
          }
        }
      }

      // HTTP 202, 404, or 200 with in-progress state: treat as running
      if (res.status === 202 || res.status === 404 || res.status === 200) {
        const remainingTime = deadlineMs - (Date.now() - startTime);
        if (remainingTime <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(currentDelay, remainingTime)));
        currentDelay = Math.min(Math.round(currentDelay * this.backoffMultiplier), this.maxDelayMs);
        continue;
      }

      // 5xx Server errors: retry with backoff
      if (res.status >= 500) {
        const remainingTime = deadlineMs - (Date.now() - startTime);
        if (remainingTime <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(currentDelay, remainingTime)));
        currentDelay = Math.min(Math.round(currentDelay * this.backoffMultiplier), this.maxDelayMs);
        continue;
      }

      // Other client error (e.g. 401, 403): fail immediately
      throw new Error(
        `Bright Data poll failed with HTTP ${res.status} (${res.statusText}): ${rawText || 'No response body'}`
      );
    }

    const totalElapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    throw new Error(
      `Research collection reached deadline after ${totalElapsedSeconds}s (${attempt} attempts). Snapshot preserved for resume.`
    );
  }
}
