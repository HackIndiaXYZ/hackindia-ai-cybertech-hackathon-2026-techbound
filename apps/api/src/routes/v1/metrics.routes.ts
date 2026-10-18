import { Router } from 'express';
import { renderMetrics } from '../../infra/metrics.js';

/**
 * Prometheus-style metrics exposition (plan §26, Phase 4C, closes P1-4).
 * Deliberately unauthenticated like /health, and deliberately low-cardinality
 * and content-free: aggregate counters, a latency histogram, room/socket
 * gauges and client-telemetry summaries only. No user ids, no text, no
 * per-session series (SECURITY §28).
 */
export const metricsRouter = Router();

metricsRouter.get('/metrics', (_req, res) => {
  res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderMetrics());
});
