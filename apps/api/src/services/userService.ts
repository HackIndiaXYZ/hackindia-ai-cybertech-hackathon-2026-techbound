import bcrypt from 'bcryptjs';
import type { AuthResponse, SignupRequest, LoginRequest, User } from '@isl/shared-types';
import { getDatabase } from '../infra/db/index.js';
import { AppError } from '../errors/AppError.js';
import { config } from '../config/index.js';
import { signAccessToken, issueRefreshToken, issuePasswordResetToken, consumePasswordResetToken } from './authService.js';
import { getMailTransport } from './mail/mailer.js';

/**
 * User + authentication service (repo/service pattern, plan §11 item 4).
 * Passwords are hashed with bcrypt; plaintext is never stored or logged (§25).
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
  // Constant-ish failure message to avoid user enumeration (§25).
  const invalid = AppError.unauthorized('Incorrect email or password.');
  if (!userRecord) throw invalid;

  const ok = await bcrypt.compare(input.password, userRecord.passwordHash);
  if (!ok) throw invalid;

  const user: User = db.users.toPublic(userRecord);
  const { token, expiresIn } = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id);
  return { user, tokens: { accessToken: token, refreshToken, tokenType: 'Bearer', expiresIn } };
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
 * not the account exists — no existence signal ever leaves the server (§25).
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
 * Known limitation (ADR-033): existing refresh tokens are not revoked here —
 * opaque refresh tokens are keyed by hash and not enumerable by user id in the
 * KV fallback, so a logout-everywhere fan-out needs a userId index (deferred).
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await consumePasswordResetToken(token);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await getDatabase().users.updatePassword(userId, passwordHash);
}
