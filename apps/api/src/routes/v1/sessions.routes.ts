import { Router } from 'express';
import { asyncHandler } from '../../errors/errorHandler.js';
import { validate, type AuthedRequest } from '../../middleware/validate.js';
import { authMiddleware } from '../../middleware/auth.js';
import { createSessionSchema, joinSessionSchema, moderateSessionSchema } from '../../validation/schemas.js';
import * as sessionService from '../../services/sessionService.js';
import { AppError } from '../../errors/AppError.js';
import { ok } from '../respond.js';

/** Session lifecycle endpoints (plan §11 item 3, §23 /api/v1/sessions, §3.1). */
export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware);

sessionsRouter.post(
  '/',
  validate(createSessionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await sessionService.createSession(
      req.user!.id,
      req.body.type,
      req.body.maxParticipants,
    );
    // createSession already includes iceServers (§12 item 5).
    ok(res, result, 201);
  }),
);

// History readback (Phase 5.5): the caller's own sessions, newest first.
// Registered before '/:sessionId' so the static paths are never shadowed.
sessionsRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const raw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(1, Math.trunc(raw)), 100) : 50;
    ok(res, await sessionService.listMySessions(req.user!.id, limit));
  }),
);

// Derived contacts (Phase 5.5): people the caller has shared sessions with.
sessionsRouter.get(
  '/contacts',
  asyncHandler(async (req: AuthedRequest, res) => {
    ok(res, await sessionService.listMyContacts(req.user!.id));
  }),
);

sessionsRouter.get(
  '/:sessionId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const session = await sessionService.getSession(req.params.sessionId);
    ok(res, session);
  }),
);

sessionsRouter.post(
  '/:sessionId/join',
  validate(joinSessionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await sessionService.joinSession(
      req.params.sessionId,
      req.user!.id,
      req.user!.email,
      req.body.joinToken,
    );
    ok(res, result);
  }),
);

sessionsRouter.post(
  '/:sessionId/leave',
  asyncHandler(async (req: AuthedRequest, res) => {
    await sessionService.leaveSession(req.params.sessionId, req.user!.id);
    ok(res, { left: true });
  }),
);

sessionsRouter.post(
  '/:sessionId/end',
  asyncHandler(async (req: AuthedRequest, res) => {
    const session = await sessionService.endSession(req.params.sessionId, req.user!.id);
    ok(res, session);
  }),
);

/**
 * Host-only moderation (plan §19). REST is the deterministic, testable path and
 * returns the persisted participant so the host UI can correct an optimistic
 * guess; the socket relay then mirrors the same effect to everyone else.
 * A non-host actor gets 403 — never a silent no-op.
 */
sessionsRouter.post(
  '/:sessionId/moderate',
  validate(moderateSessionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await sessionService.moderateParticipant(
      req.params.sessionId,
      req.user!.id,
      req.body.targetUserId,
      req.body.action,
    );
    if (!result) {
      throw AppError.forbidden('Only the session host can moderate participants.');
    }
    ok(res, result);
  }),
);
