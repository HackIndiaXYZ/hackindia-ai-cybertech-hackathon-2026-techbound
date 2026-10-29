// Silent drop is intentional here; propagating would leak bearer tokens to the console (SEC-07).
import { describe, it, expect, vi } from 'vitest';
import { IslEngineProvider } from './islEngineProvider.js';
import type { HandFeatures } from './types.js';

function mockFeatures(overrides: Partial<HandFeatures> = {}): HandFeatures {
  return {
    fingersExtended: [false, false, false, false, false],
    thumbExtended: false,
    extendedFingerCount: 0,
    pinchDistance: 0.1,
    fingerSpread: 0.2,
    ...overrides,
  };
}

describe('IslEngineProvider', () => {
  it('initializes with trained hierarchical identifier and online status', () => {
    const provider = new IslEngineProvider();
    expect(provider.name).toBe('isl-engine-hierarchical');
    expect(provider.trained).toBe(true);
    expect(provider.status).toBe('online');
  });

  it('returns trained dynamic sign with true confidence when active', () => {
    const onDetection = vi.fn();
    const provider = new IslEngineProvider({ onDetection });

    provider.handleDirectDetection({
      gestureId: 'Thank You',
      label: 'Thank You',
      confidence: 0.942,
      hands: ['right'],
      detectedAt: new Date().toISOString(),
      breakdown: { gating: 0.98, specialist: 0.96, latencyMs: 42 },
      provider: 'isl-engine-hierarchical',
      trained: true,
    });

    expect(onDetection).toHaveBeenCalledTimes(1);
    expect(provider.latencyMs).toBe(42);

    const pred = provider.classify(mockFeatures(), 'right');
    expect(pred).not.toBeNull();
    expect(pred?.gestureId).toBe('Thank You');
    expect(pred?.confidence).toBe(0.942);
  });

  it('falls back to heuristic classifier when no dynamic sign is active', () => {
    const provider = new IslEngineProvider();

    // Fist features: 0 fingers extended
    const fistFeatures = mockFeatures({
      fingersExtended: [false, false, false, false, false],
      extendedFingerCount: 0,
      pinchDistance: 0.2,
    });

    const pred = provider.classify(fistFeatures, 'right');
    expect(pred).not.toBeNull();
    expect(pred?.gestureId).toBe('fist');
  });

  it('buffers landmark windows and streams when window threshold is met', async () => {
    const customStreamer = vi.fn().mockResolvedValue({
      gestureId: 'Hospital',
      label: 'Hospital',
      confidence: 0.88,
      hands: ['right'],
      detectedAt: new Date().toISOString(),
    });

    const provider = new IslEngineProvider({
      windowSize: 30,
      streamIntervalMs: 10,
      customStreamer,
    });

    const mockPoints = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

    // Feed 20 frames to exceed the 15 frame minimum threshold
    for (let i = 0; i < 20; i++) {
      provider.feedLandmarks(mockPoints);
    }

    // Wait for async customStreamer call
    await new Promise((r) => setTimeout(r, 50));

    expect(customStreamer).toHaveBeenCalled();
  });

  it('gracefully degrades to fallback when streamer fails', async () => {
    const onStatusChange = vi.fn();
    const customStreamer = vi.fn().mockRejectedValue(new Error('Connection lost'));

    const provider = new IslEngineProvider({
      windowSize: 30,
      streamIntervalMs: 10,
      customStreamer,
      onStatusChange,
    });

    const mockPoints = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    for (let i = 0; i < 20; i++) {
      provider.feedLandmarks(mockPoints);
    }

    await new Promise((r) => setTimeout(r, 50));

    expect(provider.trained).toBe(false);
    expect(provider.status).toBe('fallback');
    expect(onStatusChange).toHaveBeenCalledWith('fallback');
  });

  it('does not fabricate predictions for ambiguous features in fallback mode', () => {
    const provider = new IslEngineProvider();
    provider.handleEngineUnavailable();

    // Ambiguous features: ring and pinky only
    const ambiguous = mockFeatures({
      fingersExtended: [false, false, false, true, true],
      extendedFingerCount: 2,
    });

    const result = provider.classify(ambiguous, 'right');
    expect(result).toBeNull();
  });
});
