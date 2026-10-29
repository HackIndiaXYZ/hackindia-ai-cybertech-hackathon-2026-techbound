import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { getDatabase } from '../../infra/db/index.js';
import { latestConsentGranted } from './misc.routes.js';
import type { ConsentRecord } from '@isl/shared-types';
import type { Express } from 'express';

/**
 * Phase 4A integration tests (§22/§23): the persistence routes finally get
 * exercised the way the client uses them, and the consent check is proven to
 * be the real boundary — writes without a granted `recording` scope are
 * rejected server-side no matter what a client sends. Memory driver.
 */

async function signup(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'supersecret', displayName: 'Tester', role: 'hearing' });
  expect(res.status).toBe(201);
  return res.body.data.tokens.accessToken as string;
}

async function newSession(auth: string): Promise<string> {
  const res = await request(app).post('/api/v1/sessions').set('Authorization', `Bearer ${auth}`).send({ type: 'group' });
  expect(res.status).toBe(201);
  return res.body.data.session.id as string;
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('latestConsentGranted (pure)', () => {
  const rec = (granted: boolean, at: string, scope: ConsentRecord['scope'] = 'recording'): ConsentRecord => ({
    id: `id-${at}`,
    userId: 'u1',
    scope,
    granted,
    grantedAt: at,
  });

  it('empty history is no consent', () => {
    expect(latestConsentGranted([], 'recording')).toBe(false);
  });

  it('newest grantedAt wins regardless of list order', () => {
    const records = [rec(true, '2026-10-02T00:00:00.000Z'), rec(false, '2026-10-09T00:00:00.000Z')];
    expect(latestConsentGranted(records, 'recording')).toBe(false);
  });

  it('scopes never bleed into each other', () => {
    const records = [rec(true, '2026-10-01T00:00:00.000Z', 'analytics')];
    expect(latestConsentGranted(records, 'recording')).toBe(false);
    expect(latestConsentGranted(records, 'analytics')).toBe(true);
  });
});

describe('consent-gated persistence writes', () => {
  it('rejects transcript/translation/message writes before consent, allows them after, and blocks again after revoking', async () => {
    const auth = await signup(`consent-${Date.now()}@example.com`);
    const sessionId = await newSession(auth);

    const transcript = {
      sessionId,
      source: 'speech',
      text: 'please repeat that',
      isFinal: true,
      confidence: null, // honest: browser did not report one
      language: 'en-IN',
    };
    const translation = {
      sessionId,
      sourceTranscriptId: 'tr-42',
      sourceText: 'please repeat that',
      targetRepresentation: JSON.stringify({ concepts: [] }),
      confidence: 0.5,
      fallbackUsed: true,
    };
    const message = { sessionId, body: 'typing instead' };

    // 1. No consent: every content write is refused with an actionable code.
    for (const [path, body] of [
      ['/transcripts', transcript],
      ['/translations', translation],
      ['/messages', message],
    ] as const) {
      const denied = await request(app).post(`/api/v1${path}`).set('Authorization', `Bearer ${auth}`).send(body);
      expect(denied.status, path).toBe(403);
      expect(denied.body.error.code, path).toBe('CONSENT_REQUIRED');
    }

    // 2. Grant the scope server-side; the identical writes now succeed.
    const grant = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${auth}`)
      .send({ scope: 'recording', granted: true });
    expect(grant.status).toBe(201);

    const tRes = await request(app).post('/api/v1/transcripts').set('Authorization', `Bearer ${auth}`).send(transcript);
    expect(tRes.status).toBe(201);
    expect(tRes.body.data.confidence).toBeNull(); // stored as absence, not 0

    const trRes = await request(app).post('/api/v1/translations').set('Authorization', `Bearer ${auth}`).send(translation);
    expect(trRes.status).toBe(201);

    const mRes = await request(app).post('/api/v1/messages').set('Authorization', `Bearer ${auth}`).send(message);
    expect(mRes.status).toBe(201);

    // The client writer dedups translations by sourceTranscriptId; the route
    // itself is plain insert (rows belong to the retry-free path above).

    // 3. Reads return exactly what was persisted, for the History screen.
    const listed = await request(app).get(`/api/v1/transcripts/${sessionId}`).set('Authorization', `Bearer ${auth}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].text).toBe('please repeat that');

    // 4. Revoke: writes are refused again — latest record wins, both directions.
    const revoke = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${auth}`)
      .send({ scope: 'recording', granted: false });
    expect(revoke.status).toBe(201);

    const afterRevoke = await request(app).post('/api/v1/transcripts').set('Authorization', `Bearer ${auth}`).send(transcript);
    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('requires auth on the write routes themselves', async () => {
    const res = await request(app).post('/api/v1/transcripts').send({});
    expect(res.status).toBe(401);
  });

  it('gestures stay acknowledge-only (ADR-028): 202 for a real session, 404 otherwise, no rows anywhere', async () => {
    const auth = await signup(`gesture-${Date.now()}@example.com`);
    const sessionId = await newSession(auth);
    const db = getDatabase();

    const ack = await request(app)
      .post('/api/v1/gestures')
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId, gestureId: 'g1', label: 'handshape-open-5', confidence: 0.31 });
    expect(ack.status).toBe(202);
    expect(ack.body.data).toMatchObject({ accepted: true, gestureId: 'g1' });

    // Nothing was fabricated into the durable stores by the acknowledgement.
    expect((await db.transcripts.listBySession(sessionId))).toHaveLength(0);
    expect((await db.messages.listBySession(sessionId))).toHaveLength(0);

    const missing = await request(app)
      .post('/api/v1/gestures')
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId: 'nope', gestureId: 'g2', label: 'x', confidence: 0.1 });
    expect(missing.status).toBe(404);
  });
});

describe('feedback + admin readback (5.6)', () => {
  async function signupAs(email: string, role: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'supersecret', displayName: 'T', role });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  it('creates feedback (201) and lists it for an admin, but 403s a non-admin', async () => {
    const userAuth = await signup(`fb-${Date.now()}@example.com`);
    const post = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${userAuth}`)
      .send({ category: 'translation', rating: 2, comment: 'glossary missed a concept' });
    expect(post.status).toBe(201);

    const forbidden = await request(app).get('/api/v1/admin/feedback').set('Authorization', `Bearer ${userAuth}`);
    expect(forbidden.status).toBe(403);

    const adminAuth = await signupAs(`admin-${Date.now()}@example.com`, 'admin');
    const list = await request(app).get('/api/v1/admin/feedback').set('Authorization', `Bearer ${adminAuth}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.some((f: { id: string }) => f.id === post.body.data.id)).toBe(true);
  });

  it('bounds the admin page by limit', async () => {
    const adminAuth = await signupAs(`admin2-${Date.now()}@example.com`, 'admin');
    const res = await request(app).get('/api/v1/admin/feedback?limit=1').set('Authorization', `Bearer ${adminAuth}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it('rejects an invalid feedback body and unauthenticated admin reads', async () => {
    const userAuth = await signup(`fbv-${Date.now()}@example.com`);
    const bad = await request(app)
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${userAuth}`)
      .send({ category: 'nope', rating: 9 });
    expect(bad.status).toBe(400);

    const noAuth = await request(app).get('/api/v1/admin/feedback');
    expect(noAuth.status).toBe(401);
  });
});
