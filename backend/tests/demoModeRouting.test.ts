import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import { ResearchAdapter } from '../src/services/researchAdapter.js';
import { EXACT_DEMO_FIXTURE_LABEL, SessionDocument } from '@web-slinger/shared';

describe('DEMO_MODE Routing & Session State Guarantees', () => {
  let sessionRepo: InMemorySessionRepository;
  let jobRepo: InMemoryJobRepository;
  let mockResearchAdapter: ResearchAdapter;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    sessionRepo = new InMemorySessionRepository();
    jobRepo = new InMemoryJobRepository();
    mockResearchAdapter = {
      executeResearch: vi.fn().mockRejectedValue(new Error('Should never be called in DEMO_MODE')),
    };
    app = createApp(sessionRepo, jobRepo, mockResearchAdapter);
  });

  describe('1. DEMO_MODE=true: POST /api/sessions session creation', () => {
    it('creates session with explicit dataMode="demo", persists labelled fixtures, and never calls Bright Data', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', 'React'],
        goal: 'Work on edge tooling',
      });

      expect(res.status).toBe(201);
      expect(res.body.data_mode).toBe('demo');
      expect(res.body.dataMode).toBe('demo');
      expect(res.body.research_results).toBeDefined();
      expect(res.body.research_results.length).toBe(6);

      // Verify researchAdapter was NOT invoked
      expect(mockResearchAdapter.executeResearch).not.toHaveBeenCalled();

      // Every fixture has is_fixture=true and exact fixture label
      for (const item of res.body.research_results) {
        expect(item.is_fixture).toBe(true);
        expect(item.fixture_label).toBe(EXACT_DEMO_FIXTURE_LABEL);
        expect(item.company_name).toBeDefined();
        expect(item.candidate_repositories).toBeDefined();
      }

      // Verify persisted session in repository
      const persisted = await sessionRepo.getSession(res.body.session_id);
      expect(persisted?.data_mode).toBe('demo');
      expect(persisted?.research_results?.length).toBe(6);
    });

    it('treats explicit mode: "demo" as authoritative and creates demo session with completed fixtures', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', 'React'],
        mode: 'demo',
      });

      expect(res.status).toBe(201);
      expect(res.body.data_mode).toBe('demo');
      expect(res.body.dataMode).toBe('demo');
      expect(res.body.research_results?.length).toBe(6);
      expect(mockResearchAdapter.executeResearch).not.toHaveBeenCalled();
    });
  });

  describe('2. DEMO_MODE=true: GET /api/sessions/:sessionId/status', () => {
    it('returns completed demo fixtures immediately and never returns live degraded or polling status', async () => {
      const createRes = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', 'React'],
      });

      const sessionId = createRes.body.session_id;

      const statusRes = await request(app).get(`/api/sessions/${sessionId}/status`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data_mode).toBe('demo');
      expect(statusRes.body.research_results).toBeDefined();
      expect(statusRes.body.research_results.length).toBe(6);
      expect(statusRes.body.current_job).toBeUndefined(); // no polling job

      // Every fixture verified
      for (const item of statusRes.body.research_results) {
        expect(item.is_fixture).toBe(true);
        expect(item.fixture_label).toBe(EXACT_DEMO_FIXTURE_LABEL);
      }
    });
  });

  describe('3. DEMO_MODE=true: POST /api/sessions/:sessionId/research bypass', () => {
    it('immediately returns completed demo state without triggering background research job', async () => {
      const createRes = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', 'React'],
      });

      const sessionId = createRes.body.session_id;

      const researchRes = await request(app).post(`/api/sessions/${sessionId}/research`);
      expect(researchRes.status).toBe(200);
      expect(researchRes.body.status).toBe('completed');
      expect(researchRes.body.is_fixture).toBe(true);
      expect(researchRes.body.results.length).toBe(6);

      // Verify researchAdapter was NOT invoked
      expect(mockResearchAdapter.executeResearch).not.toHaveBeenCalled();
    });
  });

  describe('4. DEMO_MODE=false: Live research path remains intact', () => {
    it('triggers live research adapter when session data_mode is live', async () => {
      const liveAdapter: ResearchAdapter = {
        executeResearch: vi.fn().mockResolvedValue({
          status: 'completed',
          results: [],
          message: 'Live research completed',
        }),
      };
      const customApp = createApp(sessionRepo, jobRepo, liveAdapter);

      const liveSession: SessionDocument = {
        session_id: 'live-session-123',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'created',
        data_mode: 'live',
        dataMode: 'live',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };
      await sessionRepo.createSession(liveSession);

      const launchRes = await request(customApp).post('/api/sessions/live-session-123/research');
      expect(launchRes.status).toBe(202);
      expect(launchRes.body.status).toBe('queued');

      await new Promise((r) => setTimeout(r, 60));
      expect(liveAdapter.executeResearch).toHaveBeenCalledTimes(1);
    });
  });
});
