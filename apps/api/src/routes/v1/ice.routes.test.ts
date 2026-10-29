import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

async function signup(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'supersecret', displayName: 'ICE Tester', role: 'deaf' });
  expect(res.status).toBe(201);
  return res.body.data.tokens.accessToken as string;
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('ICE servers endpoint (/api/v1/ice-servers) — 4E.4', () => {
  it('requires authentication on POST /ice-servers', async () => {
    const res = await request(app).post('/api/v1/ice-servers');
    expect(res.status).toBe(401);
  });

  it('requires authentication on GET /ice-servers', async () => {
    const res = await request(app).get('/api/v1/ice-servers');
    expect(res.status).toBe(401);
  });

  it('POST /ice-servers returns STUN/TURN servers to authenticated users', async () => {
    const auth = await signup(`ice-post-${Date.now()}@example.com`);
    const res = await request(app)
      .post('/api/v1/ice-servers')
      .set('Authorization', `Bearer ${auth}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.iceServers)).toBe(true);
    expect(res.body.data.iceServers.length).toBeGreaterThan(0);
    expect(res.body.data.iceServers[0].urls).toBeDefined();
  });

  it('GET /ice-servers returns STUN/TURN servers to authenticated users', async () => {
    const auth = await signup(`ice-get-${Date.now()}@example.com`);
    const res = await request(app)
      .get('/api/v1/ice-servers')
      .set('Authorization', `Bearer ${auth}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.iceServers)).toBe(true);
    expect(res.body.data.iceServers.length).toBeGreaterThan(0);
  });
});
