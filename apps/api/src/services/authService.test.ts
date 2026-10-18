import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  signAccessToken,
  verifyAccessToken,
  signJoinToken,
  verifyJoinToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAccessToken,
  isAccessTokenRevoked,
  issuePasswordResetToken,
  consumePasswordResetToken,
} from './authService.js';
import { signup, login, resetPassword } from './userService.js';
import { getDatabase } from '../infra/db/index.js';
import { AppError } from '../errors/AppError.js';

describe('authService token round-trip (§25)', () => {
  it('signs and verifies an access token with expected claims', () => {
    const { token, expiresIn } = signAccessToken({ sub: 'u1', role: 'deaf', email: 'a@b.c' });
    expect(expiresIn).toBeGreaterThan(0);
    const claims = verifyAccessToken(token);
    expect(claims).toMatchObject({ sub: 'u1', role: 'deaf', email: 'a@b.c' });
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/i); // 4E.2 revocation id
  });

  it('access token jti is stable through verification', () => {
    const { token, jti } = signAccessToken({ sub: 'u1', role: 'deaf', email: 'a@b.c' });
    expect(verifyAccessToken(token).jti).toBe(jti);
  });

  it('rejects a tampered token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrowError(AppError);
  });

  it('join tokens are scoped to a session', () => {
    const t = signJoinToken('sess-1', 'u1');
    expect(verifyJoinToken(t)).toEqual({ sessionId: 'sess-1', userId: 'u1' });
  });
});

describe('userService (§25 password safety)', () => {
  it('hashes passwords and never returns the hash to clients', async () => {
    const email = `u-${Date.now()}@example.com`;
    const { user, tokens } = await signup({
      email,
      password: 'supersecret',
      displayName: 'U',
      role: 'hearing',
    });
    expect(tokens.accessToken).toBeTruthy();
    expect(user).not.toHaveProperty('passwordHash');

    const db = getDatabase();
    const stored = await db.users.findByEmail(email);
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe('supersecret');
    expect(await bcrypt.compare('supersecret', stored!.passwordHash)).toBe(true);
  });

  it('rejects duplicate email with a conflict', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await signup({ email, password: 'supersecret', displayName: 'A', role: 'hearing' });
    await expect(
      signup({ email, password: 'supersecret', displayName: 'B', role: 'hearing' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('login fails on wrong password with generic message', async () => {
    const email = `fail-${Date.now()}@example.com`;
    await signup({ email, password: 'supersecret', displayName: 'A', role: 'hearing' });
    await expect(login({ email, password: 'wrong' })).rejects.toThrow(/Incorrect email or password/);
  });
});

describe('refresh rotation + access revocation (4E.2)', () => {
  it('refresh token is single-use: consume returns user id, replay fails closed', async () => {
    const rt = await issueRefreshToken('user-rot');
    expect(await consumeRefreshToken(rt)).toBe('user-rot');
    await expect(consumeRefreshToken(rt)).rejects.toBeInstanceOf(AppError);
  });

  it('an unknown refresh token is rejected', async () => {
    await expect(consumeRefreshToken('deadbeef'.repeat(12))).rejects.toBeInstanceOf(AppError);
  });

  it('logout revokes a refresh token so it can no longer be consumed', async () => {
    const rt = await issueRefreshToken('user-lo');
    await revokeRefreshToken(rt);
    await expect(consumeRefreshToken(rt)).rejects.toBeInstanceOf(AppError);
  });

  it('revoking an access jti flips isAccessTokenRevoked (assert revoked fails)', async () => {
    const jti = 'jti-' + Date.now();
    expect(await isAccessTokenRevoked(jti)).toBe(false);
    await revokeAccessToken(jti);
    expect(await isAccessTokenRevoked(jti)).toBe(true);
  });
});

describe('password reset tokens (5.2)', () => {
  it('reset token is single-use: consume returns user id, replay fails closed', async () => {
    const t = await issuePasswordResetToken('user-rs');
    expect(await consumePasswordResetToken(t)).toBe('user-rs');
    await expect(consumePasswordResetToken(t)).rejects.toBeInstanceOf(AppError);
  });

  it('an unknown reset token is rejected', async () => {
    await expect(consumePasswordResetToken('cafebabe'.repeat(8))).rejects.toBeInstanceOf(AppError);
  });

  it('resetPassword overwrites the hash so the new password logs in and the old fails', async () => {
    const email = `rs-${Date.now()}@example.com`;
    const { user } = await signup({ email, password: 'supersecret', displayName: 'R', role: 'hearing' });
    const token = await issuePasswordResetToken(user.id);
    await resetPassword(token, 'brandnewpass');
    await expect(login({ email, password: 'supersecret' })).rejects.toThrow(/Incorrect email or password/);
    const res = await login({ email, password: 'brandnewpass' });
    expect(res.tokens.accessToken).toBeTruthy();
  });
});
