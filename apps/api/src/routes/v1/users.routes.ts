// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { Router } from 'express';
import { asyncHandler } from '../../errors/errorHandler.js';
import { validate, type AuthedRequest } from '../../middleware/validate.js';
import { authMiddleware } from '../../middleware/auth.js';
import { updateProfileSchema } from '../../validation/schemas.js';
import { getDatabase } from '../../infra/db/index.js';
import * as userService from '../../services/userService.js';
import { AppError } from '../../errors/AppError.js';
import { ok } from '../respond.js';

/** User + profile endpoints (plan Â§23 /api/v1/users). Auth required. */
export const usersRouter = Router();
usersRouter.use(authMiddleware);

usersRouter.get(
  '/me',
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await userService.getUserById(req.user!.id);
    ok(res, user);
  }),
);

usersRouter.get(
  '/me/profile',
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const profile = await db.profiles.getByUserId(req.user!.id);
    if (!profile) throw AppError.notFound('Profile not found.');
    ok(res, profile);
  }),
);

usersRouter.patch(
  '/me/profile',
  validate(updateProfileSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const db = getDatabase();
    const existing = await db.profiles.getByUserId(req.user!.id);
    const merged = {
      userId: req.user!.id,
      preferredInputMode: req.body.preferredInputMode ?? existing?.preferredInputMode ?? 'speech',
      preferredOutputMode: req.body.preferredOutputMode ?? existing?.preferredOutputMode ?? 'text',
      primaryLanguage: req.body.primaryLanguage ?? existing?.primaryLanguage ?? 'en-IN',
      secondaryLanguage: req.body.secondaryLanguage ?? existing?.secondaryLanguage,
      avatarGender: req.body.avatarGender ?? existing?.avatarGender,
      accessibilitySettings:
        req.body.accessibilitySettings ??
        existing?.accessibilitySettings ?? {
          highContrast: false,
          reduceMotion: false,
          largeControls: false,
          captionFontSize: 18,
          screenReaderOptimized: false,
        },
    };
    const saved = await db.profiles.upsert(merged);
    ok(res, saved);
  }),
);
