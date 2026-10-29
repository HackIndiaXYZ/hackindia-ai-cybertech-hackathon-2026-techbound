// The empty catch is deliberate; surfacing here would leak bearer tokens to the client console (SEC-07).
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
    // The suite-wide test setup enables the OAuth dev secret; a production
    // deployment is clean, and the guard below would (correctly) refuse to boot.
    OAUTH_DEV_MODE: 'false',
    OAUTH_DEV_SECRET: '',
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

  it('boots when TURN is configured with ephemeral TURN_SECRET', async () => {
    vi.resetModules();
    setProd({ TURN_URL: 'turn:turn.example.com:3478', TURN_SECRET: 'my-secret' });
    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('refuses to boot with TURN credentials set without TURN_URL', async () => {
    vi.resetModules();
    setProd({ TURN_SECRET: 'my-secret' });
    await expect(import('./index.js')).rejects.toThrow(/TURN credentials set without a matching TURN_URL/);
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

describe('production OAuth boot guard (Supabase Google sign-in)', () => {
  it('refuses to boot with the forgeable dev-mode OAuth secret', async () => {
    vi.resetModules();
    setProd({ OAUTH_DEV_MODE: 'true', OAUTH_DEV_SECRET: 'leaky' });
    await expect(import('./index.js')).rejects.toThrow(/OAUTH_DEV_MODE/);
  });

  it('boots in production with real Supabase verification configured', async () => {
    vi.resetModules();
    setProd({ SUPABASE_ISSUER_URL: 'https://demo.supabase.co' });
    await expect(import('./index.js')).resolves.toBeTruthy();
  });
});
