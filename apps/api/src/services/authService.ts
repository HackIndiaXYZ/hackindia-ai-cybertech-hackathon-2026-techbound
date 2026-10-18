import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AppError } from '../errors/AppError.js';
import { getKVStore } from '../infra/redis/index.js';

/**
 * Short-lived bearer token issuing + verification (plan §25 security).
 * Access tokens carry only { sub, role, email } + a `jti` so they can be revoked
 * before their (already short) expiry. Refresh tokens are opaque single-use
 * random strings held (hashed) in the KV store and rotated on every refresh.
 */

export interface AccessTokenClaims {
  sub: string; // user id
  role: string;
  email: string;
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  jti: string;
}

export function signAccessToken(claims: AccessTokenClaims): { token: string; expiresIn: number; jti: string } {
  const jti = crypto.randomUUID();
  const expiresIn = config.api.tokenTtlSeconds;
  const options: SignOptions = { expiresIn, issuer: 'isl-api', jwtid: jti };
  const token = jwt.sign(claims, config.api.jwtSecret, options);
  return { token, expiresIn, jti };
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  try {
    const decoded = jwt.verify(token, config.api.jwtSecret, { issuer: 'isl-api' });
    if (typeof decoded === 'string' || !('sub' in decoded)) {
      throw AppError.unauthorized('Malformed token.');
    }
    const { sub, role, email, jti } = decoded as jwt.JwtPayload & { sub: string };
    return { sub, role: String(role), email: String(email), jti: String(jti ?? '') };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Session expired or invalid. Please sign in again.');
  }
}

// --- Refresh tokens (opaque, single-use, rotated) + access-token revocation ---

const REFRESH_PREFIX = 'auth:refresh:';
const REVOKED_PREFIX = 'auth:revoked:';
const RESET_PREFIX = 'auth:reset:';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Mint a random refresh token and store its hash against the user id. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  await getKVStore().set(`${REFRESH_PREFIX}${hashToken(token)}`, userId, config.api.refreshTokenTtlSeconds);
  return token;
}

/**
 * Exchange a presented refresh token for its user id and INVALIDATE it.
 * Single-use rotation: a replayed (already-consumed) token is not found and
 * fails closed, so a stolen token cannot be reused after a legit refresh.
 */
export async function consumeRefreshToken(token: string): Promise<string> {
  const kv = getKVStore();
  const key = `${REFRESH_PREFIX}${hashToken(token)}`;
  const userId = await kv.get(key);
  if (!userId) {
    throw AppError.unauthorized('Refresh token is invalid or expired. Please sign in again.');
  }
  await kv.del(key);
  return userId;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await getKVStore().del(`${REFRESH_PREFIX}${hashToken(token)}`);
}

/** Blocklist the access token's jti for the remainder of its natural lifetime. */
export async function revokeAccessToken(jti: string, ttlSeconds = config.api.tokenTtlSeconds): Promise<void> {
  if (!jti) return;
  await getKVStore().set(`${REVOKED_PREFIX}${jti}`, '1', ttlSeconds);
}

export async function isAccessTokenRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  return (await getKVStore().get(`${REVOKED_PREFIX}${jti}`)) !== null;
}

// --- Password-reset tokens (opaque, single-use, short-lived) ---

/** Mint a one-shot reset token bound to a user id, stored hashed with a short TTL. */
export async function issuePasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await getKVStore().set(`${RESET_PREFIX}${hashToken(token)}`, userId, config.api.passwordResetTtlSeconds);
  return token;
}

/** Resolve a presented reset token to its user id and invalidate it (single-use). */
export async function consumePasswordResetToken(token: string): Promise<string> {
  const kv = getKVStore();
  const key = `${RESET_PREFIX}${hashToken(token)}`;
  const userId = await kv.get(key);
  if (!userId) {
    throw AppError.unauthorized('Reset link is invalid or expired. Please request a new one.');
  }
  await kv.del(key);
  return userId;
}

/** Issues a short-lived join token used by the signaling layer to authorize a room join. */
export function signJoinToken(sessionId: string, userId: string): string {
  return jwt.sign({ sessionId, userId, kind: 'join' }, config.api.jwtSecret, {
    expiresIn: 60,
    issuer: 'isl-api',
  });
}

export function verifyJoinToken(token: string): { sessionId: string; userId: string } {
  try {
    const decoded = jwt.verify(token, config.api.jwtSecret, { issuer: 'isl-api' }) as jwt.JwtPayload & {
      sessionId: string;
      userId: string;
      kind: string;
    };
    if (decoded.kind !== 'join') throw new Error('wrong token kind');
    return { sessionId: decoded.sessionId, userId: decoded.userId };
  } catch {
    throw AppError.forbidden('Invalid or expired join token.');
  }
}
