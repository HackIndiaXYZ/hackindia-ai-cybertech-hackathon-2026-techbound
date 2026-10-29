import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import type { Express } from 'express';

/**
 * Supabase Google OAuth seam, exercised through the dev-mode shared secret
 * (src/test/setup.ts) so the *shipped* verify -> upsert -> session path runs
 * without a live Supabase project. The real deployment path differs only in how
 * the token signature is checked (project JWKS instead of HS256).
 */

const DEV_SECRET = 'test-oauth-dev-secret';

function providerToken(claims: Record<string, unknown>): string {
  return jwt.sign(claims, DEV_SECRET, { algorithm: 'HS256', issuer: 'oauth-dev', expiresIn: 3600 });
}

function googleIdentity(email: string, name: string): Record<string, unknown> {
  return {
    sub: `auth0|google-${email}`,
    email,
    email_verified: true,
    aud: 'authenticated',
    full_name: name,
    user_metadata: { full_name: name, verified_email: true },
    app_metadata: { provider: 'google' },
  };
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('GET /auth/google/status', () => {
  it('reports the active verification mode', async () => {
    const res = await request(app).get('/api/v1/auth/google/status');
    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.mode).toBe('dev');
  });
});

describe('POST /auth/google', () => {
  it('rejects a token it cannot verify (§25 fail closed)', async () => {
    const forged = jwt.sign(googleIdentity('forged@example.com', 'Forged'), 'not-the-secret', {
      algorithm: 'HS256',
      issuer: 'oauth-dev',
    });
    const res = await request(app).post('/api/v1/auth/google').send({ token: forged });
    expect(res.status).toBe(401);
  });

  it('refuses to create an account for an unverified email', async () => {
    const unverified = { ...googleIdentity('unverified@example.com', 'Unverified') };
    delete unverified.email_verified;
    delete unverified.user_metadata;
    const res = await request(app).post('/api/v1/auth/google').send({ token: providerToken(unverified) });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/not verified/i);
  });

  it('exchanges a verified provider token for a first-party session', async () => {
    const email = `google-${Date.now()}@example.com`;
    const res = await request(app).post('/api/v1/auth/google').send({ token: providerToken(googleIdentity(email, 'Google User')) });
    expect(res.status).toBe(200);
    const { user, tokens } = res.body.data;
    expect(user.email).toBe(email);
    expect(user.displayName).toBe('Google User');
    expect(tokens.accessToken).toBeTruthy();

    // The minted token is an ordinary platform session: /users/me authorises it.
    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });

  it('is idempotent — the same Google account resolves to one local user', async () => {
    const email = `dupe-${Date.now()}@example.com`;
    const first = await request(app).post('/api/v1/auth/google').send({ token: providerToken(googleIdentity(email, 'First Name')) });
    const second = await request(app).post('/api/v1/auth/google').send({ token: providerToken(googleIdentity(email, 'Renamed On Google')) });
    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    // The provider name wins, so the directory reflects the real Google profile.
    expect(second.body.data.user.displayName).toBe('Renamed On Google');
  });

  it('never lets a Google-only account log in with a guessed password', async () => {
    const email = `nopa-${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/google').send({ token: providerToken(googleIdentity(email, 'No Password')) });
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'guessmeplease' });
    expect(res.status).toBe(401);
  });
});
