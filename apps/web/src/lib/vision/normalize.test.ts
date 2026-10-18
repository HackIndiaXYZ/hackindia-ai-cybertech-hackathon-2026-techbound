import { describe, it, expect } from 'vitest';
import { normalizeHand, toLandmarks } from './normalize.js';
import { MIDDLE_MCP, WRIST } from './constants.js';
import { makeOpenPalm } from './testFactories.js';

describe('normalizeHand (§13 Normalization)', () => {
  it('copies landmark points into the shared immutable shape', () => {
    expect(toLandmarks([{ x: 1, y: 2, z: 3 }])).toEqual([{ x: 1, y: 2, z: 3 }]);
  });

  it('translates the wrist to the origin and scales the palm to unit length', () => {
    const n = normalizeHand(makeOpenPalm());
    expect(n[WRIST]).toEqual({ x: 0, y: 0, z: 0 });
    const palm = Math.hypot(n[MIDDLE_MCP].x, n[MIDDLE_MCP].y);
    expect(palm).toBeCloseTo(1, 3);
  });

  it('returns an empty array for an incomplete hand rather than classify garbage', () => {
    expect(normalizeHand(makeOpenPalm().slice(0, 10))).toEqual([]);
  });
});
