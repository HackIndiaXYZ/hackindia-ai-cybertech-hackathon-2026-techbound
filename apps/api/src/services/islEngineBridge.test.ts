// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { islEngineBridge } from './islEngineBridge.js';
import { config } from '../config/index.js';

describe('islEngineBridge', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back to HTTP POST when WebSocket is not connected', async () => {
    const mockLandmarks = Array.from({ length: 30 }, () =>
      Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    );

    const mockResponse = {
      success: true,
      sign: 'Thank You',
      group: 2,
      confidence: 0.942,
      breakdown: {
        gating: 0.98,
        specialist: 0.96,
        gating_probs: [0.01, 0.01, 0.98],
        specialist_probs: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.96, 0.01],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as any;

    const result = await islEngineBridge.predictLandmarks(mockLandmarks, 1700000000000);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${config.islEngineBaseUrl}/predict/landmarks`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.sign).toBe('Thank You');
    expect(result?.group).toBe(2);
    expect(result?.confidence).toBe(0.942);
    expect(result?.breakdown.gating).toBe(0.98);
    expect(result?.breakdown.specialist).toBe(0.96);
    expect(result?.clientTimestamp).toBe(1700000000000);
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles HTTP error gracefully without throwing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

    const result = await islEngineBridge.predictLandmarks([]);
    expect(result).toBeNull();
  });

  it('returns null when API returns success = false', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as any;

    const result = await islEngineBridge.predictLandmarks([]);
    expect(result).toBeNull();
  });
});
