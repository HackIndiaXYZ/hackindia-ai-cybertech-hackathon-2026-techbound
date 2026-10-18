import { describe, it, expect } from 'vitest';
import { HeuristicHandShapeClassifier } from './classifier.js';
import type { HandFeatures } from './types.js';

function feat(o: Partial<{ thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean; pinch: number; spread: number }> = {}): HandFeatures {
  const thumb = o.thumb ?? false;
  const index = o.index ?? false;
  const middle = o.middle ?? false;
  const ring = o.ring ?? false;
  const pinky = o.pinky ?? false;
  return {
    fingersExtended: [thumb, index, middle, ring, pinky] as [boolean, boolean, boolean, boolean, boolean],
    thumbExtended: thumb,
    extendedFingerCount: [index, middle, ring, pinky].filter(Boolean).length,
    pinchDistance: o.pinch ?? 1,
    fingerSpread: o.spread ?? 0,
  };
}

describe('HeuristicHandShapeClassifier (§13 model abstraction)', () => {
  const c = new HeuristicHandShapeClassifier();

  it('self-declares as an untrained heuristic (honesty, no fabricated ISL)', () => {
    expect(c.trained).toBe(false);
    expect(c.name).toMatch(/heuristic/i);
  });

  it('maps hand shapes', () => {
    expect(c.classify(feat({ thumb: true, index: true, middle: true, ring: true, pinky: true, spread: 0.8 }), 'right')?.gestureId).toBe('open_palm');
    expect(c.classify(feat({ pinch: 0.4 }), 'right')?.gestureId).toBe('fist');
    expect(c.classify(feat({ index: true }), 'right')?.gestureId).toBe('pointing');
    expect(c.classify(feat({ index: true, middle: true }), 'right')?.gestureId).toBe('peace');
    expect(c.classify(feat({ thumb: true }), 'right')?.gestureId).toBe('thumbs_up');
    expect(c.classify(feat({ middle: true, ring: true, pinky: true, pinch: 0.1 }), 'right')?.gestureId).toBe('ok_sign');
  });

  it('reports nothing (null) for an ambiguous combination', () => {
    expect(c.classify(feat({ index: true, middle: true, ring: true }), 'right')).toBeNull();
  });

  it('keeps confidence within [0,1]', () => {
    for (const f of [feat({ thumb: true, index: true, middle: true, ring: true, pinky: true, spread: 5 }), feat({ pinch: 0.4 })]) {
      const p = c.classify(f, 'right');
      if (p) expect(p.confidence).toBeGreaterThanOrEqual(0);
      if (p) expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });
});
