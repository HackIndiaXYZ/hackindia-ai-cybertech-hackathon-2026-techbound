// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../errors/AppError.js';

/**
 * Supabase Auth (Google OAuth) JWT verification.
 *
 * The web app completes the Supabase OAuth flow in the browser and hands the
 * Supabase-issued ID token to this API, which verifies it against the project's
 * JWKS (RS256/ES256) before minting our own first-party session tokens.
 *
 * Dev/test escape hatch: with OAUTH_DEV_MODE=true + OAUTH_DEV_SECRET, an HS256
 * token signed with that shared secret is accepted so the OAuth seam is
 * exercisable without a Supabase project. The config layer refuses to boot in
 * production with these set, so the forgeable path can never go live.
 */

export interface SupabaseIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  provider: string | null;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  [key: string]: unknown;
}

// Bounded JWKS cache â€” Supabase rotates signing keys rarely; 10 min refresh is
// the same ballpark as their own published guidance and keeps per-login latency
// to a memory hit in the common case.
const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(config.auth.supabaseIssuerUrl);
}

export function isOAuthDevModeActive(): boolean {
  return config.auth.oauthDevMode && Boolean(config.auth.oauthDevSecret) && !config.isProd;
}

/** True when at least one verification path (real project or dev-mode) is live. */
export function isOAuthExchangeAvailable(): boolean {
  return isSupabaseConfigured() || isOAuthDevModeActive();
}

/**
 * Did the provider assert this email is verified? Hosted Supabase has been observed
 * putting the flag in three different places depending on version/provider, so all
 * canonical shapes are accepted â€” the token is already signature-verified against
 * this exact project at this point, so none of them are attacker-chosen. Absence of
 * every flag is still treated as unverified (fail closed).
 */
function isEmailVerified(claims: jwt.JwtPayload): boolean {
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return [claims.email_verified, meta.email_verified, meta.verified_email].some((v) => v === true);
}

function identityFromClaims(claims: jwt.JwtPayload): SupabaseIdentity {
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!email) throw AppError.unauthorized('Supabase token carries no email identity.');
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const nameCandidates = [claims.full_name, meta.full_name, meta.name];
  const displayName = nameCandidates.find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return {
    sub: String(claims.sub),
    email,
    emailVerified: isEmailVerified(claims),
    displayName: displayName?.trim() ?? null,
    provider: typeof claims.app_metadata?.provider === 'string' ? claims.app_metadata.provider : null,
  };
}

async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const url = `${config.auth.supabaseIssuerUrl}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw AppError.internal(`Failed to fetch Supabase JWKS (${res.status}).`);
  }
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  // Cache only on success; a failed fetch must not pin an empty key set.
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function keyMatchesToken(jwk: Jwk, header: jwt.JwtHeader): crypto.KeyObject | null {
  if (header.kid && jwk.kid && jwk.kid !== header.kid) return null;
  if (jwk.kty !== 'RSA' && jwk.kty !== 'EC') return null;
  try {
    // A JWKS entry *is* JWK key material; the cast only satisfies the "ES2022"
    // lib (no DOM JsonWebKey) and adds no assumptions about the document.
    const input = { key: jwk, format: 'jwk' } as unknown as Parameters<typeof crypto.createPublicKey>[0];
    return crypto.createPublicKey(input);
  } catch {
    return null;
  }
}

/**
 * Issuers a token from the configured project may carry. Supabase has shipped two
 * shapes: the bare project URL and `{project}/auth/v1` (what current hosted GoTrue
 * signs). Both are accepted, and nothing else â€” the check is still pinned to this
 * exact project, so a token from another Supabase project fails.
 */
function expectedIssuers(): string[] {
  const base = config.auth.supabaseIssuerUrl.replace(/\/+$/, '');
  return [...new Set([base, `${base}/auth/v1`])];
}

function verifyWithJwks(token: string): jwt.JwtPayload {
  const header = jwt.decode(token, { complete: true })?.header;
  if (!header) throw AppError.unauthorized('Malformed Supabase token.');
  // Synchronous path needs the cache warm; on a cold cache we cannot await
  // inside jsonwebtoken's key callback reliably across versions, so fetch is
  // primed by verifySupabaseJwt before calling this.
  const keys = jwksCache?.keys ?? [];

  // Signature first, claims second â€” conflating them produced a misleading
  // "signature could not be verified" for what was really an issuer mismatch.
  let payload: jwt.JwtPayload | null = null;
  for (const jwk of keys) {
    const key = keyMatchesToken(jwk, header);
    if (!key) continue;
    try {
      payload = jwt.verify(token, key, { algorithms: ['RS256', 'ES256'] }) as jwt.JwtPayload;
      break;
    } catch {
      continue;
    }
  }
  if (!payload) throw AppError.unauthorized('Supabase token signature could not be verified.');

  if (!expectedIssuers().includes(payload.iss as string)) {
    throw AppError.unauthorized(`Supabase token issuer is not the configured project (got "${String(payload.iss)}").`);
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes('authenticated')) {
    throw AppError.unauthorized(
      `Supabase token audience is not an end-user session (got "${String(payload.aud)}").`,
    );
  }
  return payload;
}

function verifyDevToken(token: string): jwt.JwtPayload {
  try {
    return jwt.verify(token, config.auth.oauthDevSecret, {
      algorithms: ['HS256'],
      issuer: 'oauth-dev',
    }) as jwt.JwtPayload;
  } catch {
    // A bad signature/expiry is an authentication failure, never a 500.
    throw AppError.unauthorized('Sign-in token could not be verified.');
  }
}

/**
 * Verify a Supabase ID token and extract the identity it asserts.
 * Rejects (401, fail closed) any token that does not validate.
 */
export async function verifySupabaseJwt(token: string): Promise<SupabaseIdentity> {
  if (!token) throw AppError.unauthorized('Missing Supabase token.');

  let claims: jwt.JwtPayload;
  if (isSupabaseConfigured()) {
    // Prime the JWKS cache (network) before synchronous verification.
    await fetchJwks().catch((err) => {
      if (err instanceof AppError) throw err;
      throw AppError.internal('Failed to reach the Supabase JWKS endpoint.');
    });
    claims = verifyWithJwks(token);
    if (!isEmailVerified(claims)) {
      // Naming the claims actually seen turns the next drift into a one-line read
      // instead of a repeated live OAuth round-trip.
      const seen = Object.entries({
        email_verified: claims.email_verified,
        'user_metadata.email_verified': (claims.user_metadata as Record<string, unknown> | undefined)?.email_verified,
        'user_metadata.verified_email': (claims.user_metadata as Record<string, unknown> | undefined)?.verified_email,
      })
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ');
      throw AppError.unauthorized(`Supabase account email is not verified (${seen}).`);
    }
  } else if (isOAuthDevModeActive()) {
    claims = verifyDevToken(token);
  } else {
    throw AppError.internal('OAuth sign-in is not configured on this deployment.');
  }

  return identityFromClaims(claims);
}

/** Test helper: drop the cached key set between suites. */
export function resetJwksCacheForTests(): void {
  jwksCache = null;
}
