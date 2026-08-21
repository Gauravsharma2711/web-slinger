import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Backend API', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('returns status 200 with { status: "ok" }', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('sets CORS headers correctly for allowed origin http://localhost:5173', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('does not set CORS header for unauthorized origin', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-site.com');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
