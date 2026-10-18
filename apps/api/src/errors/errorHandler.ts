import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { logger } from '../infra/logger.js';
import { observeError } from '../infra/metrics.js';

/** Wraps async route handlers so thrown errors reach the error middleware. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => unknown>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  const err = AppError.notFound(`Route ${req.method} ${req.originalUrl} not found.`);
  observeError(err.code, err.statusCode);
  res.status(err.statusCode).json(err.toApiError(res.locals.requestId));
}

/** Centralized error handler producing the consistent error envelope (§23). */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof ZodError) {
    const appErr = AppError.badRequest('The submitted data did not pass validation.', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    observeError(appErr.code, appErr.statusCode);
    res.status(appErr.statusCode).json(appErr.toApiError(requestId));
    return;
  }

  if (err instanceof AppError) {
    observeError(err.code, err.statusCode);
    if (err.statusCode >= 500) {
      logger.error('request_error', {
        code: err.code,
        message: err.message,
        path: req.originalUrl,
        requestId,
      });
    }
    res.status(err.statusCode).json(err.toApiError(requestId));
    return;
  }

  const appErr = AppError.internal('An unexpected error occurred.', err);
  observeError(appErr.code, appErr.statusCode);
  logger.error('unhandled_error', {
    message: err instanceof Error ? err.message : String(err),
    path: req.originalUrl,
    requestId,
  });
  res.status(appErr.statusCode).json(appErr.toApiError(requestId));
}
