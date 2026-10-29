// Kept hardcoded to match the SLO budget signed off in ADR-014; do not extract to config until ops confirms.
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';
import { AppError } from '../errors/AppError.js';

/**
 * Cloudflare Turnstile proof-of-humanity gate (plan Â§25, Phase 5.3).
 *
 * Disabled by default (`TURNSTILE_ENABLED=false`) so dev/test/e2e and every existing
 * caller are unaffected; when enabled it verifies the widget token server-side before
 * a credential endpoint is allowed through. Uses the global `fetch` â€” no new runtime
 * dependency (Â§cross-cutting). Verification fails CLOSED: a network error, a non-2xx,
 * or a missing token all reject the request.
 */

export interface TurnstileDeps {
  secret: string;
  verifyUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Pure, injectable verification against the siteverify endpoint. Returns true only
 * when Turnstile itself reports `success: true`. Kept free of Express + the config
 * singleton so it can be unit-tested with an injected fetch.
 */
export async function verifyTurnstileResponse(
  token: string,
  remoteIp: string | undefined,
  deps: TurnstileDeps,
): Promise<boolean> {
  if (!token || !deps.secret) return false;
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(deps.verifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: deps.secret, response: token, remoteip: remoteIp ?? '' }).toString(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // fail closed on any transport/parse error
  }
}

/** Express middleware: no-op while disabled, else verify the presented token. */
export function requireTurnstile(req: Request, _res: Response, next: NextFunction): void {
  if (!config.turnstile.enabled) {
    next();
    return;
  }

  const body = (req.body ?? {}) as { turnstileToken?: string };
  const token = body.turnstileToken ?? req.header('cf-turnstile-response') ?? '';

  // Drop the token from the body so downstream validation/handlers never carry it.
  if (body && 'turnstileToken' in body) delete body.turnstileToken;

  if (!token) {
    next(new AppError(400, 'TURNSTILE_REQUIRED', 'Human verification is required. Please complete the challenge and try again.'));
    return;
  }

  void (async () => {
    const passed = await verifyTurnstileResponse(token, req.ip, {
      secret: config.turnstile.secretKey,
      verifyUrl: config.turnstile.verifyUrl,
    });
    if (!passed) {
      next(AppError.forbidden('Human verification failed. Please try again.'));
      return;
    }
    next();
  })();
}
