import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../infra/logger.js';
import { observeHttpRequest } from '../infra/metrics.js';

/**
 * Attaches a correlation id to every request/response and logs completion.
 * requestId is echoed in error envelopes (§23) and structured logs (§26).
 * Phase 4C also folds each request into the metrics histogram — labelled by
 * the matched *route pattern*, never the raw URL, so path parameters cannot
 * mint unbounded Prometheus series.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('http_request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      requestId,
    });
    const route = req.route ? `${req.baseUrl ?? ''}${req.route.path}` : 'unmatched';
    observeHttpRequest(req.method, route, res.statusCode, durationMs);
  });

  next();
}
