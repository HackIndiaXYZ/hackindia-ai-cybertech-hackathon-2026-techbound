import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { getDatabase, resetDatabaseForTests } from './index.js';

/**
 * Postgres persistence integration (GAP-AND-PLAN 4D, closes P1-5). The unit
 * suites prove the contract; this proves the SQL path actually stores and reads
 * the honest shapes end-to-end — in particular that `confidence` survives as a
 * real NULL (not a fabricated 0) through insert and select, which only the Postgres
 * mapper can get wrong.
 *
 * It SELF-SKIPS unless DB_DRIVER=postgres, so `npm run test:integration` locally
 * (no DB) collects zero work; CI with a Postgres service runs it for real.
 */

const IS_PG = process.env.DB_DRIVER === 'postgres';

let app: Express;

describe.skipIf(!IS_PG)('Postgres persistence (DB_DRIVER=postgres)', () => {
  beforeAll(async () => {
    resetDatabaseForTests();
    const db = getDatabase();
    // Fail loudly if the env lied and we are about to assert against memory.
    expect(db.driver).not.toBe('fallback-memory');
    await db.migrate();
    app = createApp();
  });

  afterAll(async () => {
    await getDatabase().close();
    resetDatabaseForTests();
  });

  async function signup(): Promise<string> {
    const email = `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'supersecret', displayName: 'Pg Tester', role: 'hearing' });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  async function newSession(auth: string): Promise<string> {
    const res = await request(app).post('/api/v1/sessions').set('Authorization', `Bearer ${auth}`).send({ type: 'group' });
    expect(res.status).toBe(201);
    return res.body.data.session.id as string;
  }

  async function grantConsent(auth: string, scope: string, granted: boolean): Promise<void> {
    const res = await request(app).post('/api/v1/consent').set('Authorization', `Bearer ${auth}`).send({ scope, granted });
    expect(res.status).toBe(201);
  }

  it('persists a transcript with a genuine NULL confidence and reads it back', async () => {
    const auth = await signup();
    const sessionId = await newSession(auth);
    await grantConsent(auth, 'recording', true);

    const create = await request(app)
      .post('/api/v1/transcripts')
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId, source: 'speech', text: 'Hello there', isFinal: true, confidence: null, language: 'en-IN' });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/v1/transcripts/${sessionId}`).set('Authorization', `Bearer ${auth}`);
    expect(list.status).toBe(200);
    const row = list.body.data.find((t: { text: string }) => t.text === 'Hello there');
    expect(row).toBeTruthy();
    // The honest-null property, verified against real SQL, not the fake store.
    expect(row.confidence).toBeNull();
  });

  it('stores and lists a text message for the session', async () => {
    const auth = await signup();
    const sessionId = await newSession(auth);
    await grantConsent(auth, 'recording', true);

    const create = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId, body: 'Typing fallback line' });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/v1/messages/${sessionId}`).set('Authorization', `Bearer ${auth}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((m: { body: string }) => m.body === 'Typing fallback line')).toBe(true);
  });

  it('enforces the consent boundary at the SQL layer: revoke then write is 403', async () => {
    const auth = await signup();
    const sessionId = await newSession(auth);
    await grantConsent(auth, 'recording', true);
    await grantConsent(auth, 'recording', false); // latest record wins -> revoked

    const denied = await request(app)
      .post('/api/v1/transcripts')
      .set('Authorization', `Bearer ${auth}`)
      .send({ sessionId, source: 'text', text: 'should not persist', isFinal: true, confidence: 0.9, language: 'en-IN' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('CONSENT_REQUIRED');
  });
});
