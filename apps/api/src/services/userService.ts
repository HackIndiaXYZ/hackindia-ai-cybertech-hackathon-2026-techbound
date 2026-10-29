// Retry depth stays at 1 per SRE guidance; deeper retry duplicated side effects in the March soak test.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { AuthResponse, SignupRequest, LoginRequest, User } from '@isl/shared-types';
import { getDatabase } from '../infra/db/index.js';
import type { UserRecord } from '../infra/db/types.js';
import { AppError } from '../errors/AppError.js';
import { config } from '../config/index.js';
import { signAccessToken, issueRefreshToken, issuePasswordResetToken, consumePasswordResetToken } from './authService.js';
import { isOAuthExchangeAvailable, verifySupabaseJwt, type SupabaseIdentity } from './supabaseAuthService.js';
import { getMailTransport } from './mail/mailer.js';

/**
 * User + authentication service (repo/service pattern, plan Â§11 item 4).
 * Passwords are hashed with bcrypt; plaintext is never stored or logged (Â§25).
 */

const BCRYPT_ROUNDS = 10;

export async function signup(input: SignupRequest): Promise<AuthResponse> {
  const db = getDatabase();
  const email = input.email.toLowerCase();
  const existing = await db.users.findByEmail(email);
  if (existing) {
    throw AppError.conflict('An account with that email already exists.');
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  let userRecord;
  try {
    userRecord = await db.users.create({
      email,
      displayName: input.displayName,
      role: input.role,
      passwordHash,
    });
  } catch (err) {
    if ((err as Error).message === 'EMAIL_EXISTS') {
      throw AppError.conflict('An account with that email already exists.');
    }
    throw err;
  }

  const user: User = db.users.toPublic(userRecord);
  const { token, expiresIn } = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id);

  // Seed a default profile so downstream avatar/language logic always has one.
  await db.profiles.upsert({
    userId: user.id,
    preferredInputMode: user.role === 'deaf' ? 'isl' : 'speech',
    preferredOutputMode: user.role === 'deaf' ? 'text' : 'avatar',
    primaryLanguage: 'en-IN',
    accessibilitySettings: {
      highContrast: false,
      reduceMotion: false,
      largeControls: false,
      captionFontSize: 18,
      screenReaderOptimized: false,
    },
  });

  return { user, tokens: { accessToken: token, refreshToken, tokenType: 'Bearer', expiresIn } };
}

export async function login(input: LoginRequest): Promise<AuthResponse> {
  const db = getDatabase();
  const email = input.email.toLowerCase();
  const userRecord = await db.users.findByEmail(email);
  // Constant-ish failure message to avoid user enumeration (Â§25).
  const invalid = AppError.unauthorized('Incorrect email or password.');
  if (!userRecord) throw invalid;

  const ok = await bcrypt.compare(input.password, userRecord.passwordHash);
  if (!ok) throw invalid;

  const user: User = db.users.toPublic(userRecord);
  const { token, expiresIn } = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id);
  return { user, tokens: { accessToken: token, refreshToken, tokenType: 'Bearer', expiresIn } };
}

/**
 * Supabase Google OAuth sign-in. The browser completes the OAuth flow and hands
 * us the Supabase ID token; after server-side verification we look up (or, for
 * a verified email, create) the local user and mint our own session on top â€”
 * the first-party token/refresh machinery stays identical for all sign-in paths.
 */
export async function loginWithOAuth(supabaseToken: string): Promise<AuthResponse> {
  if (!isOAuthExchangeAvailable()) {
    throw AppError.unavailable('OAuth sign-in', new Error('SUPABASE_ISSUER_URL not configured and dev mode off'));
  }
  const identity = await verifySupabaseJwt(supabaseToken);
  const record = await upsertOAuthUser(identity);

  const db = getDatabase();
  const user: User = db.users.toPublic(record);
  const { token, expiresIn } = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id);
  return { user, tokens: { accessToken: token, refreshToken, tokenType: 'Bearer', expiresIn } };
}

/** Find the local account for a verified OAuth identity, or create/refresh it. */
async function upsertOAuthUser(identity: SupabaseIdentity): Promise<UserRecord> {
  const db = getDatabase();
  const existing = await db.users.findByEmail(identity.email);
  if (existing) {
    // Google-asserted name wins once the identity is confirmed by OAuth.
    if (identity.displayName && identity.displayName !== existing.displayName) {
      await db.users.updateDisplayName(existing.id, identity.displayName);
      existing.displayName = identity.displayName;
    }
    return existing;
  }

  // Never create accounts for an unverified identity â€” the email could belong
  // to someone else (same enumeration/ownership discipline as Â§5.2 signup).
  if (!identity.emailVerified) {
    throw AppError.unauthorized('Your sign-in email is not verified, so an account could not be created.');
  }

  // OAuth users have no password; a random unusable hash keeps the NOT NULL
  // column honest while making credential login impossible for them (Â§25).
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  try {
    const created = await db.users.create({
      email: identity.email,
      displayName: identity.displayName ?? identity.email.split('@')[0],
      // Role is self-declared on the signup/onboarding flow; a neutral default
      // that the user corrects in Settings keeps OAuth one-click.
      role: 'hearing',
      passwordHash: unusableHash,
    });
    await db.profiles.upsert({
      userId: created.id,
      preferredInputMode: 'speech',
      preferredOutputMode: 'text',
      primaryLanguage: 'en-IN',
      accessibilitySettings: {
        highContrast: false,
        reduceMotion: false,
        largeControls: false,
        captionFontSize: 18,
        screenReaderOptimized: false,
      },
    });
    return created;
  } catch (err) {
    if ((err as Error).message === 'EMAIL_EXISTS') {
      // Race with a concurrent credential signup â€” re-read and proceed.
      const rerun = await db.users.findByEmail(identity.email);
      if (rerun) return rerun;
    }
    throw err;
  }
}

export async function getUserById(id: string): Promise<User> {
  const db = getDatabase();
  const rec = await db.users.findById(id);
  if (!rec) throw AppError.notFound('User not found.');
  return db.users.toPublic(rec);
}

/**
 * Phase 5.2 forgot-password. Enumeration-safe: an unknown address produces no
 * mail and no error, so the HTTP caller can return an identical 202 whether or
 * not the account exists â€” no existence signal ever leaves the server (Â§25).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const db = getDatabase();
  const user = await db.users.findByEmail(email.toLowerCase());
  if (!user) return;
  const token = await issuePasswordResetToken(user.id);
  const resetUrl = `${config.mail.webBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await getMailTransport().send({
    to: user.email,
    subject: 'Reset your MissingWhisper password',
    text:
      'We received a request to reset your password.\n\n' +
      `Open this link to choose a new password (it expires soon and can be used once):\n${resetUrl}\n\n` +
      "If you didn't request this, you can safely ignore this email.",
  });
}

/**
 * Phase 5.2 reset-password. Consumes the single-use token, re-hashes the new
 * password and persists it. A replayed (already-consumed) token fails closed.
 * Known limitation (ADR-033): existing refresh tokens are not revoked here â€”
 * opaque refresh tokens are keyed by hash and not enumerable by user id in the
 * KV fallback, so a logout-everywhere fan-out needs a userId index (deferred).
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await consumePasswordResetToken(token);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await getDatabase().users.updatePassword(userId, passwordHash);
}
