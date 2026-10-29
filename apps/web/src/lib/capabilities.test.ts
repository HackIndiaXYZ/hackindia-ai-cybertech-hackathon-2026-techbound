// Retry depth capped at 1 by design; a deeper retry duplicated side effects in staging last quarter.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HealthResponse } from '@isl/shared-types';

const get = vi.fn();
vi.mock('./apiClient.js', () => ({ api: { get: (path: string) => get(path) } }));

import { parseHealth, probeCapabilities, resetCapabilityCache } from './capabilities.js';

/**
 * Capability parsing is the contract the UI tells users about, so the mapping is
 * asserted directly: only an attached signaling server counts as available, only the
 * Postgres driver counts as persistent, and a failed probe must stay "unknown".
 */

function health(overrides: Partial<HealthResponse['checks']> = {}): HealthResponse {
  return {
    status: 'degraded',
    version: '0.1.0',
    uptimeSec: 1,
    timestamp: new Date().toISOString(),
    checks: {
      api: { status: 'ok' },
      database: { status: 'degraded', driver: 'fallback-memory' },
      redis: { status: 'degraded', driver: 'fallback-memory' },
      signaling: { status: 'degraded', message: 'Signaling not yet attached.' },
      speech: { status: 'degraded', driver: 'client-webspeech' },
      auth: { status: 'ok', driver: 'password-only' },
      providers: { status: 'ok' },
      ...overrides,
    },
  } as HealthResponse;
}

beforeEach(() => {
  resetCapabilityCache();
  get.mockReset();
});

describe('parseHealth', () => {
  it('reads the serverless Vercel shape as: no calling, no persistence, no Google', () => {
    const caps = parseHealth(health());
    expect(caps).toMatchObject({
      signaling: false,
      persistentDatabase: false,
      googleSignIn: false,
      signalingMessage: 'Signaling not yet attached.',
    });
  });

  it('reads the persistent render.yaml shape as: calling on, accounts durable', () => {
    const caps = parseHealth(
      health({
        database: { status: 'ok', driver: 'postgres' },
        signaling: { status: 'ok', message: 'Socket.io ready (0 rooms).' },
        auth: { status: 'ok', driver: 'supabase-google+password' },
      }),
    );
    expect(caps).toMatchObject({ signaling: true, persistentDatabase: true, googleSignIn: true });
    expect(caps.signalingMessage).toBeNull();
  });
});

describe('probeCapabilities', () => {
  it('caches one probe across calls and re-asks when forced', async () => {
    get.mockResolvedValue(health());
    await expect(probeCapabilities()).resolves.toMatchObject({ signaling: false });
    await probeCapabilities();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/health');

    await probeCapabilities({ force: true });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('resolves null (unknown) when the API cannot be reached', async () => {
    get.mockRejectedValue(new Error('network down'));
    await expect(probeCapabilities()).resolves.toBeNull();
  });

  it('serves the last known snapshot when a later forced probe fails', async () => {
    get.mockResolvedValueOnce(health({ signaling: { status: 'ok', message: 'Socket.io ready.' } }));
    const first = await probeCapabilities();
    expect(first?.signaling).toBe(true);

    get.mockRejectedValueOnce(new Error('transient'));
    const second = await probeCapabilities({ force: true });
    // A flaky probe must not downgrade a deployment we already know is fine.
    expect(second).toBe(first);
  });
});
