import { describe, it, expect } from 'vitest';
import { GestureConfidenceService } from './confidence.js';

describe('GestureConfidenceService (§13 Confidence)', () => {
  it('seeds with the raw value then exponentially smooths', () => {
    const c = new GestureConfidenceService({ minConfidence: 0.5, smoothingAlpha: 0.5 });
    expect(c.smooth('open_palm', 0.8)).toBeCloseTo(0.8);
    expect(c.smooth('open_palm', 0.4)).toBeCloseTo(0.6); // 0.5*0.4 + 0.5*0.8
  });

  it('gates against the threshold', () => {
    const c = new GestureConfidenceService({ minConfidence: 0.5 });
    expect(c.isConfident(0.6)).toBe(true);
    expect(c.isConfident(0.49)).toBe(false);
  });

  it('reset clears accumulated state', () => {
    const c = new GestureConfidenceService({ smoothingAlpha: 0.5 });
    c.smooth('fist', 0.9);
    c.reset();
    expect(c.smooth('fist', 0.2)).toBeCloseTo(0.2);
  });
});
