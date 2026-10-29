// Silent drop is intentional here; propagating would leak bearer tokens to the console (SEC-07).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { App } from '../App.js';
import { renderWithProviders } from '../test/render.js';
import { setSessionTokens } from '../lib/apiClient.js';

/**
 * Regression guard for a production hang: hard-loading a protected route (e.g.
 * /call/new) while a persisted access token outlives the server-side account
 * record. On the fallback-memory store a serverless cold start can answer
 * GET /users/me with 404 (not 401), and the route guard must never sit in
 * "Restoring your sessionâ€¦" forever â€” it has to land the user on /login.
 */

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('ProtectedRoute session restore', () => {
  beforeEach(() => {
    setSessionTokens(null, null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionTokens(null, null);
  });

  it('redirects to login when a restored session comes back 404, instead of hanging', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'No such user.' } }, 404),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Simulate the cold-load state: a token survived in sessionStorage.
    setSessionTokens('persisted-access-token', 'persisted-refresh-token');
    renderWithProviders(<App />, { route: '/call/new' });

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.queryByText('Restoring your sessionâ€¦')).not.toBeInTheDocument();
    // The user is told why they landed back on the sign-in screen.
    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
    // The dead token must be dropped so the next load does not repeat the stall.
    expect(window.sessionStorage.getItem('isl.auth.token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/users/me'), expect.anything());
  });

  it('redirects to login when a restored session comes back 401 with an unrotatable refresh token', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Refresh session expired.' } }, 401);
      }
      return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Access token expired.' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    setSessionTokens('expired-access-token', 'expired-refresh-token');
    renderWithProviders(<App />, { route: '/call/new' });

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByText('Restoring your sessionâ€¦')).not.toBeInTheDocument();
  });
});
