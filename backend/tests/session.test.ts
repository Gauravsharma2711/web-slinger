import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  InMemorySessionRepository,
  FirestoreSessionRepository,
  toFirestoreSessionDocument,
  normalizeGoal,
} from '../src/repositories/sessionRepository.js';
import { SessionDocument } from '@web-slinger/shared';

describe('Session Manager API', () => {
  let inMemoryRepo: InMemorySessionRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    inMemoryRepo = new InMemorySessionRepository();
    app = createApp(inMemoryRepo);
  });

  describe('POST /api/sessions - Goal normalization & Undefined-safety', () => {
    it('handles stack only with no goal (returns null and stores null)', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', 'React'],
      });

      expect(res.status).toBe(201);
      expect(res.body.goal).toBeNull();

      const persisted = await inMemoryRepo.getSession(res.body.session_id);
      expect(persisted?.goal).toBeNull();
    });

    it('handles empty-string goal (normalizes to null)', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript'],
        goal: '',
      });

      expect(res.status).toBe(201);
      expect(res.body.goal).toBeNull();

      const persisted = await inMemoryRepo.getSession(res.body.session_id);
      expect(persisted?.goal).toBeNull();
    });

    it('handles whitespace-only goal (normalizes to null)', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript'],
        goal: '     ',
      });

      expect(res.status).toBe(201);
      expect(res.body.goal).toBeNull();

      const persisted = await inMemoryRepo.getSession(res.body.session_id);
      expect(persisted?.goal).toBeNull();
    });

    it('handles valid goal with surrounding whitespace (trims and returns string)', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript'],
        goal: '   Contribute to compilers   ',
      });

      expect(res.status).toBe(201);
      expect(res.body.goal).toBe('Contribute to compilers');

      const persisted = await inMemoryRepo.getSession(res.body.session_id);
      expect(persisted?.goal).toBe('Contribute to compilers');
    });

    it('creates a new session with stage "created" and 24h TTL', async () => {
      const payload = {
        stack: ['TypeScript', 'React', 'Node.js'],
        goal: 'Find open source issues in web tooling',
      };

      const res = await request(app).post('/api/sessions').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(res.body.stage).toBe('created');
      expect(res.body.stack).toEqual(['TypeScript', 'React', 'Node.js']);
      expect(res.body.normalized_stack).toEqual(['typescript', 'react', 'node.js']);
      expect(res.body.goal).toBe('Find open source issues in web tooling');
      expect(res.body.created_at).toBeDefined();
      expect(res.body.updated_at).toBeDefined();
      expect(res.body.expires_at).toBeDefined();

      // Verify expiration is roughly 24 hours in future
      const expiresAt = new Date(res.body.expires_at).getTime();
      const createdAt = new Date(res.body.created_at).getTime();
      const diffHours = (expiresAt - createdAt) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);

      // Verify persisted in repository
      const persisted = await inMemoryRepo.getSession(res.body.session_id);
      expect(persisted).not.toBeNull();
      expect(persisted?.session_id).toBe(res.body.session_id);
    });

    it('rejects payload with empty stack array', async () => {
      const res = await request(app).post('/api/sessions').send({ stack: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session input');
      expect(res.body.details).toBeDefined();
    });

    it('rejects payload with more than 5 technologies', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TS', 'React', 'Node', 'Python', 'Go', 'Rust'],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session input');
    });

    it('rejects payload with empty technology strings', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript', '   '],
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session input');
    });

    it('rejects goal exceeding 280 characters', async () => {
      const res = await request(app).post('/api/sessions').send({
        stack: ['TypeScript'],
        goal: 'x'.repeat(281),
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid session input');
    });
  });

  describe('FirestoreSessionRepository undefined-safety', () => {
    it('toFirestoreSessionDocument never produces undefined for any field', () => {
      const sessionDoc: SessionDocument = {
        session_id: '11111111-2222-3333-4444-555555555555',
        stack: ['TypeScript'],
        normalized_stack: ['typescript'],
        goal: null,
        stage: 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
        current_job_id: undefined,
        research_results: undefined,
        health: undefined,
      };

      const firestoreDoc = toFirestoreSessionDocument(sessionDoc);

      for (const [key, value] of Object.entries(firestoreDoc)) {
        expect(value, `Field ${key} should not be undefined`).not.toBeUndefined();
      }

      expect(firestoreDoc.goal).toBeNull();
      expect(firestoreDoc.current_job_id).toBeNull();
      expect(firestoreDoc.research_results).toBeNull();
      expect(firestoreDoc.health).toBeNull();
    });

    it('FirestoreSessionRepository.createSession sends zero undefined values to firestore.set()', async () => {
      const mockSet = vi.fn().mockResolvedValue({ writeTime: new Date() });
      const mockDoc = vi.fn().mockReturnValue({ set: mockSet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
      const mockFirestore = { collection: mockCollection } as unknown as import('@google-cloud/firestore').Firestore;

      const repo = new FirestoreSessionRepository('sessions', mockFirestore);

      const sessionDoc: SessionDocument = {
        session_id: '11111111-2222-3333-4444-555555555555',
        stack: ['React'],
        normalized_stack: ['react'],
        goal: null,
        stage: 'created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      };

      await repo.createSession(sessionDoc);

      expect(mockCollection).toHaveBeenCalledWith('sessions');
      expect(mockDoc).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555');
      expect(mockSet).toHaveBeenCalledTimes(1);

      const writeData = mockSet.mock.calls[0][0];
      for (const [k, v] of Object.entries(writeData)) {
        expect(v, `Firestore write data field "${k}" must not be undefined`).not.toBeUndefined();
      }
    });

    it('normalizeGoal utility correctly handles null, undefined, empty, and non-empty strings', () => {
      expect(normalizeGoal(undefined)).toBeNull();
      expect(normalizeGoal(null)).toBeNull();
      expect(normalizeGoal('')).toBeNull();
      expect(normalizeGoal('   \n\t  ')).toBeNull();
      expect(normalizeGoal('  Build Next.js app  ')).toBe('Build Next.js app');
    });
  });

  describe('GET /api/sessions/:sessionId/status', () => {
    it('returns status and remaining TTL for an active session', async () => {
      const now = new Date();
      const sessionDoc: SessionDocument = {
        session_id: '11111111-2222-3333-4444-555555555555',
        stack: ['TypeScript', 'React'],
        normalized_stack: ['typescript', 'react'],
        goal: null,
        stage: 'created',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
      await inMemoryRepo.createSession(sessionDoc);

      const res = await request(app).get(
        `/api/sessions/${sessionDoc.session_id}/status`
      );

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe(sessionDoc.session_id);
      expect(res.body.stage).toBe('created');
      expect(res.body.goal).toBeNull();
      expect(res.body.ttl_seconds_remaining).toBeGreaterThan(0);
      expect(res.body.is_expired).toBe(false);
    });

    it('returns 404 for nonexistent session', async () => {
      const res = await request(app).get(
        '/api/sessions/non-existent-session-id/status'
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Session not found' });
    });

    it('returns 404 for expired session', async () => {
      const past = new Date(Date.now() - 3600000);
      const expiredDoc: SessionDocument = {
        session_id: '99999999-8888-7777-6666-555555555555',
        stack: ['Python'],
        normalized_stack: ['python'],
        goal: null,
        stage: 'created',
        created_at: new Date(past.getTime() - 86400000).toISOString(),
        updated_at: new Date(past.getTime() - 86400000).toISOString(),
        expires_at: past.toISOString(),
      };
      await inMemoryRepo.createSession(expiredDoc);

      const res = await request(app).get(
        `/api/sessions/${expiredDoc.session_id}/status`
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Session has expired' });
    });
  });
});
