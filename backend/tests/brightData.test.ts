import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrightDataClient } from '../src/services/brightDataClient.js';
import { BrightDataResearchAdapter } from '../src/services/researchAdapter.js';
import {
  config,
  computeSha256Fingerprint,
  BrightDataConfig,
} from '../src/config.js';

describe('Bright Data Job Collector Adapter & Polling Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration & Fingerprinting', () => {
    it('computes 8-character SHA-256 fingerprints correctly', () => {
      const hash1 = computeSha256Fingerprint('c_test_collector_123');
      expect(hash1).toHaveLength(8);
      expect(hash1).toMatch(/^[0-9a-f]{8}$/);

      const emptyHash = computeSha256Fingerprint('');
      expect(emptyHash).toBe('none');
    });

    it('injects normalized immutable BrightDataConfig into BrightDataClient', () => {
      const customConfig: BrightDataConfig = Object.freeze({
        apiToken: 'custom_token',
        collectorId: 'c_custom_collector_12345',
        seedUrls: ['https://seed.test/1'],
        isConfigured: true,
        tokenFingerprint: computeSha256Fingerprint('custom_token'),
        collectorFingerprint: computeSha256Fingerprint('c_custom_collector_12345'),
        collectorPrefix: 'c_',
        collectorLength: 24,
      });

      const client = new BrightDataClient({ config: customConfig });
      expect(client.isConfigured).toBe(true);
      expect(client.activeConfig.collectorPrefix).toBe('c_');
      expect(client.activeConfig.collectorLength).toBe(24);
      expect(client.activeConfig.tokenFingerprint).toBe(
        computeSha256Fingerprint('custom_token')
      );
    });
  });

  describe('BrightDataClient DCA Flow & Progression Tests', () => {
    it('progresses from not-ready (202 / 404) to completed (200) with GET /dca/dataset?id=', async () => {
      const mockFetch = vi.fn();

      // 1. DCA Trigger response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ collection_id: 'j_test_progression_12345' }),
      } as Response);

      // 2. Poll Attempt 1: not ready (HTTP 202 Accepted / building)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        text: async () => '{"status":"building"}',
      } as Response);

      // 3. Poll Attempt 2: not ready (HTTP 404 Not Found / queued)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '{"error":"Not ready"}',
      } as Response);

      // 4. Poll Attempt 3: completed dataset (HTTP 200 OK)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify([
            {
              company_name: 'Stripe',
              job_title: 'Full Stack Engineer',
              location: 'Remote',
              url: 'https://stripe.com/jobs/1',
              description: 'Building global economic infrastructure with TypeScript.',
            },
          ]),
      } as Response);

      globalThis.fetch = mockFetch;

      const client = new BrightDataClient({
        apiToken: 'secret_test_token',
        collectorId: 'c_test_collector_12345',
        initialDelayMs: 10,
        maxDelayMs: 20,
        deadlineMs: 5000,
      });

      const seedInputs = [{ url: 'https://careers.example.com/jobs' }];
      const collectionId = await client.triggerCollection(seedInputs);
      expect(collectionId).toBe('j_test_progression_12345');

      const records = await client.pollSnapshot(collectionId, { sessionId: 'sess-123456' });
      expect(records).toHaveLength(1);
      expect((records[0] as Record<string, unknown>).company_name).toBe('Stripe');

      // Verify polling used GET /dca/dataset?id=<snapshot-id>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/dca/dataset?id=j_test_progression_12345'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer secret_test_token',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('resumes existing snapshot without triggering a new collection', async () => {
      const mockRawRecords = [
        {
          company_name: 'Oracle',
          job_title: 'Principal Software Engineer',
          url: 'https://oracle.com/jobs/1',
        },
      ];

      const validConfig: BrightDataConfig = {
        apiToken: 'test_token',
        collectorId: 'c_test_123',
        seedUrls: ['https://seed.jobs/1'],
        isConfigured: true,
        tokenFingerprint: computeSha256Fingerprint('test_token'),
        collectorFingerprint: computeSha256Fingerprint('c_test_123'),
        collectorPrefix: 'c_',
        collectorLength: 10,
      };

      const client = new BrightDataClient({ config: validConfig });
      const triggerSpy = vi.spyOn(client, 'triggerCollection');
      const pollSpy = vi.spyOn(client, 'pollSnapshot').mockResolvedValue(mockRawRecords);

      const adapter = new BrightDataResearchAdapter(client);
      const result = await adapter.executeResearch(
        'session_resume_123',
        ['TypeScript'],
        null,
        'j_existing_snapshot_99999'
      );

      // Verify triggerCollection was NOT called
      expect(triggerSpy).not.toHaveBeenCalled();
      // Verify pollSnapshot was called with the existing snapshot ID
      expect(pollSpy).toHaveBeenCalledWith('j_existing_snapshot_99999', expect.any(Object));
      expect(result.status).toBe('completed');
      expect(result.snapshotId).toBe('j_existing_snapshot_99999');
      expect(result.results).toHaveLength(1);
    });

    it('handles final degraded timeout while retaining snapshot ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        text: async () => '{"status":"building"}',
      } as Response);

      globalThis.fetch = mockFetch;

      const validConfig: BrightDataConfig = {
        apiToken: 'test_token',
        collectorId: 'c_test_123',
        seedUrls: ['https://seed.jobs/1'],
        isConfigured: true,
        tokenFingerprint: computeSha256Fingerprint('test_token'),
        collectorFingerprint: computeSha256Fingerprint('c_test_123'),
        collectorPrefix: 'c_',
        collectorLength: 10,
      };

      const client = new BrightDataClient({
        config: validConfig,
        initialDelayMs: 5,
        maxDelayMs: 10,
        deadlineMs: 30, // short deadline for test
      });

      const adapter = new BrightDataResearchAdapter(client);
      const result = await adapter.executeResearch(
        'session_timeout_123',
        ['Java'],
        null,
        'j_timeout_snapshot_12345'
      );

      expect(result.status).toBe('degraded');
      expect(result.snapshotId).toBe('j_timeout_snapshot_12345');
      expect(result.results).toHaveLength(0);
      expect(result.errorCategory).toBe('UPSTREAM_POLL_TIMEOUT');
      expect(result.health.status).toBe('degraded');
    });

    it('immediately calls onSnapshotTriggered callback on fresh trigger', async () => {
      const validConfig: BrightDataConfig = {
        apiToken: 'test_token',
        collectorId: 'c_test_123',
        seedUrls: ['https://seed.jobs/1'],
        isConfigured: true,
        tokenFingerprint: computeSha256Fingerprint('test_token'),
        collectorFingerprint: computeSha256Fingerprint('c_test_123'),
        collectorPrefix: 'c_',
        collectorLength: 10,
      };

      const client = new BrightDataClient({ config: validConfig });
      vi.spyOn(client, 'triggerCollection').mockResolvedValue('j_fresh_snapshot_777');
      vi.spyOn(client, 'pollSnapshot').mockResolvedValue([
        { company: 'Meta', title: 'Software Engineer', url: 'https://meta.com/jobs/1' },
      ]);

      const onTriggerCallback = vi.fn().mockResolvedValue(undefined);

      const adapter = new BrightDataResearchAdapter(client);
      const result = await adapter.executeResearch(
        'session_fresh_123',
        ['React'],
        null,
        null,
        onTriggerCallback
      );

      expect(onTriggerCallback).toHaveBeenCalledWith('j_fresh_snapshot_777');
      expect(result.status).toBe('completed');
      expect(result.snapshotId).toBe('j_fresh_snapshot_777');
    });
  });
});
