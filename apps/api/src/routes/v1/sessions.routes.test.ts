import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

/**
 * Phase 5.5 read-layer tests: the History (GET /sessions) and Contacts
 * (GET /sessions/contacts) endpoints must read real durable state — a session
 * you hosted or joined shows up newest-first, and a person you shared a session
 * with surfaces as a contact. Memory driver.
 */

async function signup(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'supersecret', displayName: 'Tester', role: 'hearing' });
  expect(res.status).toBe(201);
  return res.body.data.tokens.accessToken as string;
}

async function createSession(auth: string): Promise<{ id: string; joinToken: string }> {
  const res = await request(app)
    .post('/api/v1/sessions')
    .set('Authorization', `Bearer ${auth}`)
    .send({ type: 'group' });
  expect(res.status).toBe(201);
  return { id: res.body.data.session.id, joinToken: res.body.data.joinToken };
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('GET /sessions — history readback (5.5)', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/sessions');
    expect(res.status).toBe(401);
  });

  it("returns the sessions the caller hosted, newest first", async () => {
    const auth = await signup(`hist-${Date.now()}@example.com`);
    const a = await createSession(auth);
    const b = await createSession(auth);

    const res = await request(app).get('/api/v1/sessions').set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: { id: string }) => s.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    // Newest-first: b was created after a.
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it('includes a session the caller joined, not only hosted', async () => {
    const host = await signup(`host-${Date.now()}@example.com`);
    const guest = await signup(`guest-${Date.now()}@example.com`);
    const { id, joinToken } = await createSession(host);

    const joined = await request(app)
      .post(`/api/v1/sessions/${id}/join`)
      .set('Authorization', `Bearer ${guest}`)
      .send({ sessionId: id, joinToken });
    expect(joined.status).toBe(200);

    const res = await request(app).get('/api/v1/sessions').set('Authorization', `Bearer ${guest}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { id: string }) => s.id)).toContain(id);
  });

  it('bounds the page via the limit query', async () => {
    const auth = await signup(`lim-${Date.now()}@example.com`);
    await createSession(auth);
    await createSession(auth);
    const res = await request(app)
      .get('/api/v1/sessions?limit=1')
      .set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});

describe('GET /sessions/contacts — derived contacts (5.5)', () => {
  it('surfaces a co-participant by display name', async () => {
    const host = await signup(`chost-${Date.now()}@example.com`);
    const guest = await signup(`cguest-${Date.now()}@example.com`);

    const { id, joinToken } = await createSession(host);
    await request(app)
      .post(`/api/v1/sessions/${id}/join`)
      .set('Authorization', `Bearer ${guest}`)
      .send({ sessionId: id, joinToken });

    const res = await request(app)
      .get('/api/v1/sessions/contacts')
      .set('Authorization', `Bearer ${host}`);
    expect(res.status).toBe(200);
    // The host sees exactly one contact (the guest) with a resolved name.
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].displayName).toBe('Tester');
    expect(res.body.data[0].sharedSessions).toBe(1);
  });

  it('does not list the caller as their own contact', async () => {
    const auth = await signup(`self-${Date.now()}@example.com`);
    await createSession(auth);
    const res = await request(app)
      .get('/api/v1/sessions/contacts')
      .set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });
});
