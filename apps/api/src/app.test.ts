import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { getDatabase } from './infra/db/index.js';
import { issuePasswordResetToken } from './services/authService.js';
import type { Express } from 'express';

/**
 * API integration tests proving the Phase 1 foundation works end-to-end with
 * the in-memory fallback driver (plan §11 Acceptance + Definition of Done §35).
 */
describe('ISL API v1 (foundation integration)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/v1/health returns a component report', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('checks');
    expect(res.body.data.checks).toHaveProperty('database');
    // In-memory fallback => degraded is the honest status, still HTTP 200.
    expect(['ok', 'degraded']).toContain(res.body.data.status);
  });

  it('4E.2 rotates refresh tokens (single-use) and revokes the access token on logout', async () => {
    const email = `rot-${Date.now()}@example.com`;
    const su = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'supersecret', displayName: 'R', role: 'hearing' });
    expect(su.status).toBe(201);
    const refresh = su.body.data.tokens.refreshToken as string;
    expect(refresh).toBeTruthy();

    // Rotation issues a brand-new pair...
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    expect(r1.status).toBe(200);
    const refresh2 = r1.body.data.tokens.refreshToken as string;
    expect(refresh2).toBeTruthy();

    // ...and the old refresh token can no longer be replayed (reuse fails closed).
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    expect(replay.status).toBe(401);

    // The current (rotated) refresh token still works.
    const r2 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh2 });
    expect(r2.status).toBe(200);
    const access = r2.body.data.tokens.accessToken as string;
    const currentRefresh = r2.body.data.tokens.refreshToken as string;

    // Logout revokes the live access token immediately -> asserts revoked token fails.
    const out = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .send({ refreshToken: currentRefresh });
    expect(out.status).toBe(204);
    const meAfter = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${access}`);
    expect(meAfter.status).toBe(401);
  });

  it('4E.5 emits hardening security headers (helmet: nosniff/HSTS/frame/CSP)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('5.2 forgot-password is enumeration-safe and reset-password sets a new password', async () => {
    // Unknown address still returns 202 with the identical body (no signup probe).
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@nowhere.test' });
    expect(unknown.status).toBe(202);
    expect(unknown.body.data).toEqual({ accepted: true });

    const email = `rs-${Date.now()}@example.com`;
    const su = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'supersecret', displayName: 'R', role: 'hearing' });
    expect(su.status).toBe(201);

    const req = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(req.status).toBe(202);

    // The console transport does not surface the token to tests, so mint one
    // directly to drive the reset route (single-use semantics proven in unit tests).
    const token = await issuePasswordResetToken(su.body.data.user.id as string);
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'brandnewpass' });
    expect(reset.status).toBe(204);

    const loginNew = await request(app).post('/api/v1/auth/login').send({ email, password: 'brandnewpass' });
    expect(loginNew.status).toBe(200);
  });

  it('rejects invalid signup with a consistent error envelope', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({ email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('runs the full auth -> session lifecycle', async () => {
    const email = `alice-${Date.now()}@example.com`;

    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'supersecret', displayName: 'Alice', role: 'deaf' });
    expect(signup.status).toBe(201);
    expect(signup.body.data.user).not.toHaveProperty('passwordHash');
    const token = signup.body.data.tokens.accessToken;
    expect(token).toBeTruthy();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'supersecret' });
    expect(login.status).toBe(200);
    const auth = login.body.data.tokens.accessToken as string;

    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${auth}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);

    // /me requires auth
    const meNoAuth = await request(app).get('/api/v1/users/me');
    expect(meNoAuth.status).toBe(401);

    const create = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${auth}`)
      .send({ type: 'one_to_one' });
    expect(create.status).toBe(201);
    const sessionId = create.body.data.session.id as string;
    const joinToken = create.body.data.joinToken as string;
    expect(create.body.data.iceServers).toBeInstanceOf(Array);

    // Host joins using its own token.
    const join = await request(app)
      .post(`/api/v1/sessions/${sessionId}/join`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId, joinToken });
    expect(join.status).toBe(200);
    expect(join.body.data.participants.length).toBeGreaterThan(0);

    // Verify durable state landed in the store.
    const db = getDatabase();
    const session = await db.sessions.findById(sessionId);
    expect(session?.type).toBe('one_to_one');

    const end = await request(app)
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${auth}`);
    expect(end.status).toBe(200);
    expect(end.body.data.status).toBe('ended');
  });

  it('returns 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
