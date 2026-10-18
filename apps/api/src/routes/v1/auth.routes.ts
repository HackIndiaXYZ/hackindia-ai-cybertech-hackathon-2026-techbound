import { Router } from 'express';
import { asyncHandler } from '../../errors/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTurnstile } from '../../middleware/turnstile.js';
import { signupSchema, loginSchema, refreshSchema, logoutSchema, forgotPasswordSchema, resetPasswordSchema } from '../../validation/schemas.js';
import * as userService from '../../services/userService.js';
import {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAccessToken,
} from '../../services/authService.js';
import { ok } from '../respond.js';

/** Auth endpoints (plan §8 /login /signup, §23 /api/v1/auth, §25 security). */
export const authRouter = Router();

// Credential endpoints are rate limited to blunt brute force (§25). The window
// is shared by signup/login/forgot/reset, so its capacity covers all four.
const credLimiter = rateLimit({ limit: 20, windowSec: 60 });

authRouter.post(
  '/signup',
  credLimiter,
  requireTurnstile,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await userService.signup(req.body);
    ok(res, result, 201);
  }),
);

authRouter.post(
  '/login',
  credLimiter,
  requireTurnstile,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await userService.login(req.body);
    ok(res, result);
  }),
);

// 5.2 forgot-password: enumeration-safe. Always 202, regardless of whether the
// address maps to an account, so the response cannot be used to probe signups.
authRouter.post(
  '/forgot-password',
  credLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await userService.requestPasswordReset(req.body.email as string);
    ok(res, { accepted: true }, 202);
  }),
);

// 5.2 reset-password: consumes the single-use token and sets a new password.
authRouter.post(
  '/reset-password',
  credLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await userService.resetPassword(req.body.token as string, req.body.newPassword as string);
    res.status(204).end();
  }),
);

// 4E.2 rotate a single-use refresh token for a fresh access + refresh pair.
authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const userId = await consumeRefreshToken(req.body.refreshToken as string);
    const user = await userService.getUserById(userId);
    const { token, expiresIn } = signAccessToken({ sub: user.id, role: user.role, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);
    ok(res, { tokens: { accessToken: token, refreshToken, tokenType: 'Bearer', expiresIn } });
  }),
);

// 4E.2 logout: revoke the current access token immediately (jti blocklist) and
// destroy the presented refresh session so no new tokens can be minted.
authRouter.post(
  '/logout',
  authMiddleware,
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (bearer) {
      const { jti } = verifyAccessToken(bearer);
      await revokeAccessToken(jti);
    }
    const refreshToken = (req.body as { refreshToken?: string }).refreshToken;
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.status(204).end();
  }),
);
