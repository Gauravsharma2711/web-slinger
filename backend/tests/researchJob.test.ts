import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemorySessionRepository } from '../src/repositories/sessionRepository.js';
import { InMemoryJobRepository } from '../src/repositories/jobRepository.js';
import {
  FixtureResearchAdapter,
  ResearchAdapter,
} from '../src/services/researchAdapter.js';
import { SessionDocument } from '@web-slinger/shared';

describe('Research Job API & State Transitions', () => {
  let sessionRepo: InMemorySessionRepository;
  let jobRepo: InMemoryJobRepository;
  let adapter: ResearchAdapter;
  let app: ReturnType<typeof createApp>;

  const createActiveSession = async (): Promise<SessionDocument> => {
    const now = new Date();
    const session: SessionDocument = {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      stack: ['TypeScript', 'React'],
      normalized_stack: ['typescript', 'react'],
      goal: 'Explore web performance bugs',
      stage: 'created',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
    await sessionRepo.createSession(session);
    return session;
  };

  beforeEach(() => {
    sessionRepo = new InMemorySessionRepository();
    jobRepo = new InMemoryJobRepository();
    adapter = new FixtureResearchAdapter();
    app = createApp(sessionRepo, jobRepo, adapter);
  });

  describe('POST /api/sessions/:sessionId/research', () => {
    it('creates job and immediately returns queued status and researching stage', async () => {
      const session = await createActiveSession();

      const res = await request(app).post(
        `/api/sessions/${session.session_id}/research`
      );

      expect(res.status).toBe(202);
      expect(res.body.job_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(res.body.status).toBe('queued');
      expect(res.body.stage).toBe('researching');
      expect(res.body.message).toBe('Research job queued');

      // Verify session stage updated to researching
      const updatedSession = await sessionRepo.getSession(session.session_id);
      expect(updatedSession?.stage).toBe('researching');
    });

    it('returns 404 for nonexistent session', async () => {
      const res = await request(app).post(
        '/api/sessions/00000000-0000-0000-0000-000000000000/research'
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Session not found' });
    });

    it('returns 404 for expired session', async () => {
      const past = new Date(Date.now() - 3600000);
      const expiredSession: SessionDocument = {
        session_id: '99999999-9999-9999-9999-999999999999',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'created',
        created_at: new Date(past.getTime() - 86400000).toISOString(),
        updated_at: new Date(past.getTime() - 86400000).toISOString(),
        expires_at: past.toISOString(),
      };
      await sessionRepo.createSession(expiredSession);

      const res = await request(app).post(
        `/api/sessions/${expiredSession.session_id}/research`
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Session has expired' });
    });
  });

  describe('Job Lifecycle & Terminal State Guarantees', () => {
    it('transitions to completed and provides clearly labelled fixture results when in DEMO_MODE', async () => {
      const session = await createActiveSession();

      const launchRes = await request(app).post(
        `/api/sessions/${session.session_id}/research`
      );
      expect(launchRes.status).toBe(202);

      // Allow async task to complete
      await new Promise((r) => setTimeout(r, 60));

      const statusRes = await request(app).get(
        `/api/sessions/${session.session_id}/status`
      );

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.stage).toBe('researching');
      expect(statusRes.body.current_job).toBeDefined();
      expect(statusRes.body.current_job.status).toBe('completed');
      expect(statusRes.body.current_job.is_fixture).toBe(true);

      expect(statusRes.body.research_results).toHaveLength(1);
      const firstResult = statusRes.body.research_results[0];
      expect(firstResult.company_name).toContain('[DEMO FIXTURE]');
      expect(firstResult.is_fixture).toBe(true);
      expect(firstResult.source_url).toBeDefined();
    });

    it('handles degraded job status transition gracefully', async () => {
      const degradedAdapter: ResearchAdapter = {
        async executeResearch() {
          return {
            status: 'degraded',
            results: [],
            message: 'Public source availability degraded; partial results only',
            health: {
              status: 'degraded',
              message: 'Public source availability degraded',
              timestamp: new Date().toISOString(),
            },
          };
        },
      };

      const customApp = createApp(sessionRepo, jobRepo, degradedAdapter);
      const session = await createActiveSession();

      await request(customApp).post(`/api/sessions/${session.session_id}/research`);

      await new Promise((r) => setTimeout(r, 60));

      const statusRes = await request(customApp).get(
        `/api/sessions/${session.session_id}/status`
      );

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.current_job.status).toBe('degraded');
      expect(statusRes.body.current_job.message).toBe(
        'Public source availability degraded; partial results only'
      );
    });

    it('handles adapter error by always transitioning to degraded terminal state', async () => {
      const failingAdapter: ResearchAdapter = {
        async executeResearch() {
          throw new Error('Connection timeout to upstream provider');
        },
      };

      const customApp = createApp(sessionRepo, jobRepo, failingAdapter);
      const session = await createActiveSession();

      await request(customApp).post(`/api/sessions/${session.session_id}/research`);

      await new Promise((r) => setTimeout(r, 60));

      const statusRes = await request(customApp).get(
        `/api/sessions/${session.session_id}/status`
      );

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.current_job.status).toBe('degraded');
      expect(statusRes.body.current_job.message).toContain(
        'Connection timeout to upstream provider'
      );
      expect(statusRes.body.health?.status).toBe('degraded');
    });
  });
});
