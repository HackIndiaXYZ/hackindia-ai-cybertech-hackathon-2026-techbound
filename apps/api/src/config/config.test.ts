import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Production boot guards (task 4E.4.2). The config module throws at import time
 * on an unsafe production setup, so each case re-evaluates it in isolation with
 * the environment it needs. Nothing here connects to a real DB/Redis/TURN.
 */
const savedEnv = { ...process.env };

function setProd(overrides: Record<string, string>) {
  process.env = {
    ...savedEnv,
    NODE_ENV: 'production',
    API_AUTH_JWT_SECRET: 'x'.repeat(40),
    DB_DRIVER: 'postgres',
    REDIS_DRIVER: 'redis',
    TURN_URL: '',
    TURN_USERNAME: '',
    TURN_CREDENTIAL: '',
    ...overrides,
  };
}

afterEach(() => {
  process.env = { ...savedEnv };
  vi.resetModules();
});

describe('production ICE/TURN boot guard (4E.4)', () => {
  it('refuses to boot with a half-configured TURN (credential missing)', async () => {
    vi.resetModules();
    setProd({ TURN_URL: 'turn:turn.example.com:3478', TURN_USERNAME: 'user' });
    await expect(import('./index.js')).rejects.toThrow(/half-configured TURN/);
  });

  it('boots when TURN is fully configured', async () => {
    vi.resetModules();
    setProd({ TURN_URL: 'turn:turn.example.com:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' });
    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('boots when TURN is entirely absent (STUN-only)', async () => {
    vi.resetModules();
    setProd({});
    await expect(import('./index.js')).resolves.toBeTruthy();
  });
});

describe('production Turnstile boot guard (5.3)', () => {
  it('refuses to boot with Turnstile enabled but no secret', async () => {
    vi.resetModules();
    setProd({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: '' });
    await expect(import('./index.js')).rejects.toThrow(/TURNSTILE_ENABLED=true but no TURNSTILE_SECRET_KEY/);
  });

  it('boots when Turnstile is enabled with a secret', async () => {
    vi.resetModules();
    setProd({ TURNSTILE_ENABLED: 'true', TURNSTILE_SECRET_KEY: 'shh' });
    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('boots with Turnstile disabled (default)', async () => {
    vi.resetModules();
    setProd({ TURNSTILE_ENABLED: 'false' });
    await expect(import('./index.js')).resolves.toBeTruthy();
  });
});
