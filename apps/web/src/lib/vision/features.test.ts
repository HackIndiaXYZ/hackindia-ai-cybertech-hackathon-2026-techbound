import { describe, it, expect } from 'vitest';
import { extractFeatures } from './features.js';
import { normalizeHand } from './normalize.js';
import { makeFist, makeOpenPalm } from './testFactories.js';

describe('extractFeatures (§13 Feature Extraction)', () => {
  it('detects all four fingers and the thumb extended on an open palm', () => {
    const f = extractFeatures(normalizeHand(makeOpenPalm()));
    expect(f).not.toBeNull();
    expect(f!.extendedFingerCount).toBe(4);
    expect(f!.thumbExtended).toBe(true);
    expect(f!.fingersExtended).toEqual([true, true, true, true, true]);
  });

  it('detects no extended fingers on a fist', () => {
    const f = extractFeatures(normalizeHand(makeFist()));
    expect(f).not.toBeNull();
    expect(f!.extendedFingerCount).toBe(0);
    expect(f!.thumbExtended).toBe(false);
  });

  it('is scale invariant (same features for a uniformly scaled hand)', () => {
    const scaled = normalizeHand(makeOpenPalm()).map((p) => ({ x: p.x * 2, y: p.y * 2, z: p.z }));
    const a = extractFeatures(normalizeHand(makeOpenPalm()));
    const b = extractFeatures(normalizeHand(scaled));
    expect(b!.extendedFingerCount).toBe(a!.extendedFingerCount);
  });

  it('returns null for an incomplete landmark set', () => {
    expect(extractFeatures(makeOpenPalm().slice(0, 5))).toBeNull();
  });
});
