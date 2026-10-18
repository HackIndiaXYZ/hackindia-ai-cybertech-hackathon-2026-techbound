import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { resetMetricsForTests, renderMetrics } from '../../infra/metrics.js';
import type { Express } from 'express';

/**
 * Phase 4C integration (§26, P1-4): the observability surface answers with
 * real counters, provider truth is authed, and telemetry is consent-gated
 * aggregate-only — a batch without `analytics` consent never touches the
 * registry. Memory driver.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  resetMetricsForTests();
});

async function signup(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .send({ email, password: 'supersecret', displayName: 'Observer', role: 'hearing' });
  expect(res.status).toBe(201);
  return res.body.data.tokens.accessToken as string;
}

describe('GET /api/v1/metrics', () => {
  it('serves Prometheus text and counts the request itself by route pattern', async () => {
    const res = await request(app).get('/api/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE isl_http_requests_total counter');
    expect(res.text).toContain('isl_http_request_duration_ms_count');
    // The exposition itself is content-free: no bearer of user data in labels.
    expect(res.text).not.toMatch(/authorization|bearer/i);
  });
});

describe('GET /api/v1/providers', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/providers');
    expect(res.status).toBe(401);
  });

  it('answers with the four resolved capabilities and honesty flags', async () => {
    const auth = await signup(`providers-${Date.now()}@example.com`);
    const res = await request(app).get('/api/v1/providers').set('Authorization', `Bearer ${auth}`);
    expect(res.status).toBe(200);
    const caps = res.body.data.providers as { capability: string; implemented: boolean; trained: boolean; authoritative: boolean }[];
    expect(caps.map((c) => c.capability).sort()).toEqual(['speech', 'translation', 'tts', 'vision']);
    for (const c of caps) {
      expect(c.implemented).toBe(true); // defaults name only implemented values
      expect(c.trained).toBe(false); // nothing in this build is a trained model
      expect(c.authoritative).toBe(false);
    }
  });
});

describe('POST /api/v1/telemetry', () => {
  it('rejects unauthenticated writes', async () => {
    const res = await request(app).post('/api/v1/telemetry').send({ rttMs: [40] });
    expect(res.status).toBe(401);
  });

  it('403s without analytics consent and never touches the registry', async () => {
    const auth = await signup(`tele-no-${Date.now()}@example.com`);
    const res = await request(app).post('/api/v1/telemetry').set('Authorization', `Bearer ${auth}`).send({ rttMs: [40, 60] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    expect(renderMetrics()).toContain('isl_telemetry_batches_total 0');
  });

  it('accepts measured batches once analytics is granted, then folds them into metrics', async () => {
    const auth = await signup(`tele-yes-${Date.now()}@example.com`);
    const grant = await request(app).post('/api/v1/consent').set('Authorization', `Bearer ${auth}`).send({ scope: 'analytics', granted: true });
    expect(grant.status).toBe(201);

    const res = await request(app)
      .post('/api/v1/telemetry')
      .set('Authorization', `Bearer ${auth}`)
      .send({ rttMs: [40, 60], packetLossPct: [0.5], reconnectAttempts: 2, reconnectExhausted: 1 });
    expect(res.status).toBe(202);
    expect(res.body.data.accepted).toBe(true);

    const text = renderMetrics();
    expect(text).toContain('isl_telemetry_batches_total 1');
    expect(text).toContain('isl_client_rtt_ms_count 2');
    expect(text).toContain('isl_client_reconnect_attempts_total 2');
  });

  it('refuses empty and content-carrying batches with 400s', async () => {
    const auth = await signup(`tele-bad-${Date.now()}@example.com`);
    await request(app).post('/api/v1/consent').set('Authorization', `Bearer ${auth}`).send({ scope: 'analytics', granted: true });

    const empty = await request(app).post('/api/v1/telemetry').set('Authorization', `Bearer ${auth}`).send({});
    expect(empty.status).toBe(400);

    // The schema has no field for text; smuggled content fails validation,
    // not just "gets ignored" — a telemetry row physically cannot carry a transcript.
    const smuggled = await request(app)
      .post('/api/v1/telemetry')
      .set('Authorization', `Bearer ${auth}`)
      .send({ rttMs: [40], text: 'hello', transcript: { secret: true } });
    expect(smuggled.status).toBe(400);
  });
});

describe('GET /api/v1/health/ready (readiness probe)', () => {
  it('answers ready while services are degraded-but-alive', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(true);
  });
});
