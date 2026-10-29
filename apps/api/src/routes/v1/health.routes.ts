import { Router } from 'express';
import { buildHealthReport } from '../../services/healthService.js';
import { asyncHandler } from '../../errors/errorHandler.js';
import { ok } from '../respond.js';

/** Health endpoints (plan §11 backend item 2, §26). Liveness + readiness. */
export const healthRouter = Router();

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const report = await buildHealthReport();
    ok(res, report, report.status === 'down' ? 503 : 200);
  }),
);

// Lightweight liveness probe for orchestrators (no dependency checks).
healthRouter.get('/health/live', (_req, res) => ok(res, { status: 'alive' }));

// Readiness probe used by CI/CD health checks (§11 CI, §26).
healthRouter.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    const report = await buildHealthReport();
    const ready = report.status !== 'down';
    ok(res, { ready, status: report.status }, ready ? 200 : 503);
  }),
);
