import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../errors/AppError.js';

/**
 * Validates a request body against a zod schema and replaces req.body with
 * the parsed, typed result. Parse errors become 400 VALIDATION errors via
 * the central ZodError branch in the error handler (§23).
 */
export function validate<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // .parse throws ZodError -> handled centrally.
    req.body = schema.parse(req.body);
    next();
  };
}

/** Guard that a route received an authenticated principal (used with auth()). */
export interface AuthedRequest extends Request {
  user?: { id: string; role: string; email: string };
}

export function requireUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
}
