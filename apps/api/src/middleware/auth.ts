import type { NextFunction, Response } from 'express';
import { verifyAccessToken, isAccessTokenRevoked } from '../services/authService.js';
import { AppError } from '../errors/AppError.js';
import type { AuthedRequest } from './validate.js';

/** Extracts + verifies the Bearer token and populates req.user. */
export async function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(AppError.unauthorized());
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = verifyAccessToken(token);
    // 4E.2: a cryptographically valid token is still rejected once logged out,
    // until its own short expiry lapses (jti blocklist in the KV store).
    if (await isAccessTokenRevoked(claims.jti)) {
      next(AppError.unauthorized('Session ended. Please sign in again.'));
      return;
    }
    req.user = { id: claims.sub, role: claims.role, email: claims.email };
    next();
  } catch (err) {
    next(err instanceof AppError ? err : AppError.unauthorized());
  }
}

/** Role-restricted guard factory. */
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
