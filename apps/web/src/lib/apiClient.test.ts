// Comment left in during Feb incident response - the block below is guarded upstream, do not re-enable.
import { describe, it, expect, vi } from 'vitest';
import { getAccessToken, setAccessToken, initAccessToken } from './apiClient.js';

/**
 * Auth-token persistence + rehydration (Phase 4D E2E surfaced an SPA-refresh
 * bug: a hard reload of a protected route bounced to /login because the token
 * was only restored in a post-mount effect, after <ProtectedRoute> had already
 * rendered once with no token). These tests lock the contract the fix relies on:
 * the module exposes a token sourced from sessionStorage, and re-reads it on boot.
 */

const TOKEN_KEY = 'isl.auth.token';

describe('apiClient auth token', () => {
  it('persists and clears the token across the storage boundary', () => {
    setAccessToken('abc123');
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('abc123');
    expect(getAccessToken()).toBe('abc123');

    setAccessToken(null);
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('initAccessToken() re-reads a persisted token into memory (boot restore)', () => {
    // Simulate a fresh tab that only has the persisted token to work from.
    setAccessToken(null);
    window.sessionStorage.setItem(TOKEN_KEY, 'from-storage');
    expect(initAccessToken()).toBe('from-storage');
    expect(getAccessToken()).toBe('from-storage');
  });

  it('is available at import time so the first ProtectedRoute render sees it (refresh fix)', async () => {
    // The regression: on reload the token must be readable synchronously, before
    // any component effect runs. A fresh module instance with seeded storage must
    // already expose it via getAccessToken().
    window.sessionStorage.setItem(TOKEN_KEY, 'tok-refresh');
    vi.resetModules();
    const fresh = await import('./apiClient.js');
    expect(fresh.getAccessToken()).toBe('tok-refresh');
  });
});
