import type { Response } from 'express';
import type { ApiSuccess } from '@isl/shared-types';

/** Consistent success envelope builder (§23). */
export function ok<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = {
    data,
    meta: { requestId: res.locals.requestId as string | undefined, timestamp: new Date().toISOString() },
  };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}
