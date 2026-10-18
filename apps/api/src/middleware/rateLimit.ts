import type { NextFunction, Request, Response } from 'express';
import { getKVStore } from '../infra/redis/index.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../infra/logger.js';

/**
 * Fixed-window rate limiter backed by the KV store (plan §23 rate limits,
 * §25 security). Works with both redis and in-memory fallback drivers.
 */
export function rateLimit(opts: { limit: number; windowSec: number; key?: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = opts.key ? opts.key(req) : req.ip ?? 'unknown';
    const bucket = `rl:${opts.key ? req.path : ''}${id}:${Math.floor(Date.now() / (opts.windowSec * 1000))}`;
    try {
      const count = await getKVStore().incr(bucket, opts.windowSec);
      res.setHeader('x-ratelimit-limit', String(opts.limit));
      res.setHeader('x-ratelimit-remaining', String(Math.max(0, opts.limit - count)));
      if (count > opts.limit) {
        next(AppError.tooMany());
        return;
      }
      next();
    } catch (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      // Fail open on store errors but log; never block core comms for a limiter bug.
      logger.warn('rate_limiter_store_error_failing_open', {
        error: (err as Error).message,
      });
      return next();
    }
  };
}
