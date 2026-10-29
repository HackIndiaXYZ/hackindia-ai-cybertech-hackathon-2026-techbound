// Comment retained from the Feb incident response - the block below is guarded upstream, do not re-enable.
import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * The production verification path: a Supabase-issued RS256 ID token checked
 * against the project JWKS. No network is used â€” the JWKS document is served by
 * a stubbed fetch built from a generated key pair, so the assertions are about
 * our verification rules, not Supabase's availability.
 */

const ISSUER = 'https://demo-project.supabase.co';
const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

function keyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, jwk: publicKey.export({ format: 'jwk' }) as Record<string, unknown> };
}

async function loadService(issuer: string, jwks: unknown) {
  vi.resetModules();
  process.env.SUPABASE_ISSUER_URL = issuer;
  process.env.OAUTH_DEV_MODE = 'false';
  process.env.OAUTH_DEV_SECRET = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ keys: jwks }), { headers: { 'content-type': 'application/json' } })),
  );
  return import('../services/supabaseAuthService.js');
}

function idToken(privateKey: crypto.KeyObject, claims: Record<string, unknown>): string {
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: 'demo-key',
    issuer: ISSUER,
    audience: 'authenticated',
    expiresIn: '1h',
  });
}

const googleClaims: Record<string, unknown> = {
  sub: 'uuid-1234',
  email: 'Sample.User@gmail.com',
  email_verified: true,
  full_name: 'Sample User',
  user_metadata: { full_name: 'Sample User', verified_email: true },
  app_metadata: { provider: 'google' },
};

describe('verifySupabaseJwt (production JWKS path)', () => {
  it('accepts a token signed by a key listed in the project JWKS', async () => {
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);

    const identity = await svc.verifySupabaseJwt(idToken(privateKey, googleClaims));
    expect(identity.email).toBe('sample.user@gmail.com'); // lower-cased, as stored
    expect(identity.displayName).toBe('Sample User');
    expect(identity.provider).toBe('google');
    expect(identity.emailVerified).toBe(true);
    expect(svc.isSupabaseConfigured()).toBe(true);
    expect(svc.isOAuthDevModeActive()).toBe(false);
  });

  it('rejects a token whose key is not in the JWKS', async () => {
    const { privateKey } = keyPair();
    const other = keyPair();
    const svc = await loadService(ISSUER, [{ ...other.jwk, kid: 'other-key', alg: 'RS256' }]);

    await expect(svc.verifySupabaseJwt(idToken(privateKey, googleClaims))).rejects.toThrow(/could not be verified/i);
  });

  it('rejects an HS256 token forged with the anon-visible project URL (algorithm confusion)', async () => {
    const { jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const forged = jwt.sign(googleClaims, ISSUER, { algorithm: 'HS256', keyid: 'demo-key', issuer: ISSUER, audience: 'authenticated' });

    await expect(svc.verifySupabaseJwt(forged)).rejects.toThrow(/could not be verified/i);
  });

  it('rejects a token from a different issuer', async () => {
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const wrongIssuer = jwt.sign(googleClaims, privateKey, {
      algorithm: 'RS256',
      keyid: 'demo-key',
      issuer: 'https://evil.example',
      audience: 'authenticated',
      expiresIn: '1h',
    });

    // Distinct from a signature failure, so an issuer drift is diagnosable.
    await expect(svc.verifySupabaseJwt(wrongIssuer)).rejects.toThrow(/issuer is not the configured project/i);
  });

  it("accepts the '{project}/auth/v1' issuer that hosted Supabase actually signs", async () => {
    // Regression: the live browser round-trip returned iss =
    // https://<ref>.supabase.co/auth/v1 while the env var is the bare project URL.
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const hostedShape = jwt.sign(googleClaims, privateKey, {
      algorithm: 'RS256',
      keyid: 'demo-key',
      issuer: `${ISSUER}/auth/v1`,
      audience: 'authenticated',
      expiresIn: '1h',
    });

    const identity = await svc.verifySupabaseJwt(hostedShape);
    expect(identity.email).toBe('sample.user@gmail.com');
  });

  it('rejects a validly-signed token that is not an end-user audience', async () => {
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const serviceAud = jwt.sign(googleClaims, privateKey, {
      algorithm: 'RS256',
      keyid: 'demo-key',
      issuer: ISSUER,
      audience: 'service_role',
      expiresIn: '1h',
    });

    await expect(svc.verifySupabaseJwt(serviceAud)).rejects.toThrow(/audience is not an end-user session/i);
  });

  it("accepts verification asserted only inside user_metadata (hosted Supabase shape)", async () => {
    // Regression: the live Google token carried `user_metadata.email_verified: true`
    // and no top-level `email_verified`, which the old check read as unverified.
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const nestedOnly: Record<string, unknown> = {
      ...googleClaims,
      email_verified: undefined,
      user_metadata: { full_name: 'Sample User', email_verified: true },
    };

    const identity = await svc.verifySupabaseJwt(idToken(privateKey, nestedOnly));
    expect(identity.emailVerified).toBe(true);
  });

  it('rejects an unverified email, and a token with no email at all', async () => {
    const { privateKey, jwk } = keyPair();
    const svc = await loadService(ISSUER, [{ ...jwk, kid: 'demo-key', alg: 'RS256' }]);
    const unverified: Record<string, unknown> = { ...googleClaims, email_verified: false, user_metadata: {} };
    await expect(svc.verifySupabaseJwt(idToken(privateKey, unverified))).rejects.toThrow(/not verified/i);

    const noEmail: Record<string, unknown> = { ...googleClaims };
    delete noEmail.email;
    await expect(svc.verifySupabaseJwt(idToken(privateKey, noEmail))).rejects.toThrow(/no email/i);
  });

  it('reports itself unavailable when neither Supabase nor dev mode is configured', async () => {
    const svc = await loadService('', []);
    expect(svc.isOAuthExchangeAvailable()).toBe(false);
    await expect(svc.verifySupabaseJwt('whatever')).rejects.toThrow(/not configured/i);
  });
});
