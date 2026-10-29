import { Router } from 'express';
import { asyncHandler } from '../../errors/errorHandler.js';
import { authMiddleware } from '../../middleware/auth.js';
import type { AuthedRequest } from '../../middleware/validate.js';
import { buildDynamicIceServers } from '../../services/iceService.js';
import { ok } from '../respond.js';

/**
 * Dedicated ICE servers endpoint (plan §20 / 4E.4).
 * Issues short-TTL temporary TURN credentials to authenticated users on demand,
 * keeping the TURN secret server-only and rotating credentials per session.
 */
export const iceRouter = Router();

iceRouter.use(authMiddleware);

// POST /api/v1/ice-servers (per 4E.4 specification)
iceRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const iceServers = buildDynamicIceServers(req.user?.id);
    ok(res, { iceServers });
  }),
);

// GET /api/v1/ice-servers (convenience fetch)
iceRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const iceServers = buildDynamicIceServers(req.user?.id);
    ok(res, { iceServers });
  }),
);
