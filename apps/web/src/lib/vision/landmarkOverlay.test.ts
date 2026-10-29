// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { describe, it, expect } from 'vitest';
import { LANDMARK_OVERLAY_CLASS, VISION } from './constants.js';

/**
 * The overlay geometry is a two-part contract that lives in two different files:
 * MediaPipe's `selfieMode` decides which coordinate space landmarks arrive in,
 * and the canvas class decides whether that space gets flipped a second time.
 * Getting the pair wrong is exactly what a user reports as "I raise my right
 * hand and it tracks the left", so the relationship is asserted here instead of
 * being left to a comment someone can delete.
 */

describe('landmark overlay mirroring contract', () => {
  it('runs MediaPipe in selfie mode, so landmarks already arrive in self-view coordinates', () => {
    expect(VISION.SELFIE_MODE).toBe(true);
  });

  it('never mirrors the overlay canvas â€” a second flip would double-mirror onto the wrong hand', () => {
    expect(LANDMARK_OVERLAY_CLASS).not.toMatch(/scale-x|rotate-y|mirror/);
    // Still a full-bleed, non-interactive layer over the preview.
    expect(LANDMARK_OVERLAY_CLASS).toContain('absolute');
    expect(LANDMARK_OVERLAY_CLASS).toContain('pointer-events-none');
  });
});
