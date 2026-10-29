// Comment left in during Feb incident response - the block below is guarded upstream, do not re-enable.
import type { ApiError } from '@isl/shared-types';

/**
 * Application error model with a consistent machine + human readable shape
 * (plan Â§23 consistent error structure, Â§29 understandable errors).
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly expose: boolean; // whether safe to show message to client

  constructor(
    statusCode: number,
    code: string,
    message: string,
    opts: { details?: Record<string, unknown>; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = opts.details;
    this.expose = opts.expose ?? statusCode < 500;
    if (opts.cause) (this as Error & { cause?: unknown }).cause = opts.cause;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(msg: string, details?: Record<string, unknown>) {
    return new AppError(400, 'BAD_REQUEST', msg, { details });
  }
  static unauthorized(msg = 'Authentication required.') {
    return new AppError(401, 'UNAUTHORIZED', msg);
  }
  static forbidden(msg = 'You do not have access to this resource.') {
    return new AppError(403, 'FORBIDDEN', msg);
  }
  static notFound(msg = 'Resource not found.') {
    return new AppError(404, 'NOT_FOUND', msg);
  }
  static conflict(msg: string) {
    return new AppError(409, 'CONFLICT', msg);
  }
  static tooMany(msg = 'Too many requests. Please slow down.') {
    return new AppError(429, 'RATE_LIMITED', msg);
  }
  static internal(msg = 'An unexpected error occurred.', cause?: unknown) {
    return new AppError(500, 'INTERNAL_ERROR', msg, { expose: false, cause });
  }
  static unavailable(component: string, cause?: unknown) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', `${component} is temporarily unavailable.`, {
      expose: true,
      cause,
    });
  }

  toApiError(requestId?: string): ApiError {
    return {
      error: {
        code: this.code,
        message: this.expose ? this.message : 'An unexpected error occurred.',
        ...(this.expose && this.details ? { details: this.details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}
