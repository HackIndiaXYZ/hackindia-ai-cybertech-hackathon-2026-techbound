import { describe, it, expect } from 'vitest';
import { GestureSequenceValidator } from './sequenceValidator.js';
import type { SequenceObservationInput } from './types.js';

function input(gestureId: string, label: string, confidence = 0.9): SequenceObservationInput {
  return { gestureId, label, confidence, handedness: 'right' };
}

/** Feed the same gesture for `frames` consecutive frames; returns the last result. */
function hold(v: GestureSequenceValidator, gestureId: string, label: string, startTs: number, frames = 3) {
  let out: ReturnType<GestureSequenceValidator['observe']> = null;
  for (let i = 0; i < frames; i += 1) out = v.observe(input(gestureId, label), startTs + i);
  return out;
}

describe('GestureSequenceValidator (§13 temporal validation / debounce)', () => {
  it('suppresses single-frame noise and emits only once a hold is stable', () => {
    const v = new GestureSequenceValidator({ stableFrames: 3, minDwellMs: 0 });
    expect(v.observe(input('open_palm', 'Open palm'), 0)).toBeNull();
    expect(v.observe(input('open_palm', 'Open palm'), 1)).toBeNull();
    const det = v.observe(input('open_palm', 'Open palm'), 2);
    expect(det?.label).toBe('Open palm');
  });

  it('emits at most once per continuous hold', () => {
    const v = new GestureSequenceValidator({ stableFrames: 3, minDwellMs: 0 });
    hold(v, 'fist', 'Closed fist', 0);
    expect(v.observe(input('fist', 'Closed fist'), 3)).toBeNull();
  });

  it('resists flicker: an intervening different gesture resets the candidate', () => {
    const v = new GestureSequenceValidator({ stableFrames: 3, minDwellMs: 0 });
    v.observe(input('open_palm', 'Open palm'), 0);
    v.observe(input('open_palm', 'Open palm'), 1);
    v.observe(input('fist', 'Closed fist'), 2); // noise change
    expect(v.observe(input('open_palm', 'Open palm'), 3)).toBeNull(); // candidate restarted
  });

  it('honours the minimum dwell time', () => {
    const v = new GestureSequenceValidator({ stableFrames: 2, minDwellMs: 100 });
    expect(v.observe(input('pointing', 'Pointing (index)'), 0)).toBeNull();
    expect(v.observe(input('pointing', 'Pointing (index)'), 50)).toBeNull(); // 50ms < 100ms
    expect(v.observe(input('pointing', 'Pointing (index)'), 120)).not.toBeNull(); // 120ms dwell
  });

  it('caps history size and folds it into a validated sequence', () => {
    const v = new GestureSequenceValidator({ stableFrames: 2, minDwellMs: 0, maxHistorySize: 3 });
    let ts = 0;
    for (let i = 0; i < 6; i += 1) {
      // A new gesture cannot emit on its first frame; the 2nd stable frame does.
      v.observe(input('g' + i, 'Shape ' + i), ts);
      v.observe(input('g' + i, 'Shape ' + i), ts + 1);
      ts += 2;
    }
    expect(v.getHistory()).toHaveLength(3);
    const seq = v.buildSequence('session-1', 'user-1');
    expect(seq?.steps).toHaveLength(3);
    expect(seq?.sessionId).toBe('session-1');
    expect(seq?.overallConfidence).toBeGreaterThan(0);
  });

  it('buildSequence returns null with no history', () => {
    const v = new GestureSequenceValidator();
    expect(v.buildSequence('s', 'u')).toBeNull();
  });
});
