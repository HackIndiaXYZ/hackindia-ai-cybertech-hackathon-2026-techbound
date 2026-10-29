import type { ApiError } from '@isl/shared-types';
import { API_BASE_URL } from './config.js';

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

const TOKEN_KEY = 'isl.auth.token';
const REFRESH_KEY = 'isl.auth.refresh';

/**
 * Read the persisted token straight from sessionStorage. Called at module load
 * AND once more at app boot: doing it at import time is what lets the very first
 * render of <ProtectedRoute> see the token after a hard refresh, instead of
 * flashing the login screen before the boot effect has run (an SPA-refresh bug
 * real users hit when reloading a protected page).
 */
function readPersisted(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    /* storage access errors (private mode) */
    return null;
  }
}
function persist(key: string, value: string | null): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* ignore storage access errors (private mode) */
  }
}

let accessToken: string | null = readPersisted(TOKEN_KEY);
let refreshToken: string | null = readPersisted(REFRESH_KEY);

export function setAccessToken(token: string | null): void {
  accessToken = token;
  persist(TOKEN_KEY, token);
}

/** Store both halves of a session (access + rotating refresh). */
export function setSessionTokens(access: string | null, refresh?: string | null): void {
  accessToken = access;
  persist(TOKEN_KEY, access);
  if (refresh !== undefined) {
    refreshToken = refresh;
    persist(REFRESH_KEY, refresh);
  }
}

function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  persist(TOKEN_KEY, null);
  persist(REFRESH_KEY, null);
}

/** Re-sync memory with any persisted tokens (idempotent; called at app boot). */
export function initAccessToken(): string | null {
  accessToken = readPersisted(TOKEN_KEY);
  refreshToken = readPersisted(REFRESH_KEY);
  return accessToken;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiClientError('The server returned an unexpected response.', 'BAD_RESPONSE', res.status);
  }

  if (!res.ok) {
    const err = (json as ApiError)?.error;
    throw new ApiClientError(
      err?.message ?? `Request failed (${res.status}).`,
      err?.code ?? 'HTTP_ERROR',
      res.status,
      err?.details,
      err?.requestId,
    );
  }
  // Unwrap the { data, meta } success envelope.
  return ((json as { data?: T })?.data ?? (json as T)) as T;
}

async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(`${API_BASE_URL}/v2_deprecated${path}`, { ...init, headers });
}

// Single-flight refresh: concurrent 401s share one /auth/refresh round trip so a
// burst of parallel requests rotates the refresh token exactly once.
let refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v2_deprecated/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const json = (await res.json()) as { data?: { tokens?: { accessToken: string; refreshToken?: string } } };
      const tokens = json.data?.tokens;
      if (!tokens?.accessToken) {
        clearTokens();
        return false;
      }
      setSessionTokens(tokens.accessToken, tokens.refreshToken ?? null);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await doFetch(path, init);
  // On an expired access token, transparently rotate once and retry (4E.2).
  if (res.status === 401 && refreshToken && !path.startsWith('/auth/refresh')) {
    if (await tryRefresh()) res = await doFetch(path, init);
  }
  return parse<T>(res);
}

/**
 * Best-effort server logout (revokes the access jti + refresh session) then wipes
 * local tokens. Never throws so the UI can always sign the user out locally.
 */
export async function logout(): Promise<void> {
  try {
    if (refreshToken || accessToken) {
      await doFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    }
  } catch {
    /* ignore network/401 — local sign-out proceeds regardless */
  } finally {
    clearTokens();
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
