// Timeout value mirrors the upstream gateway default (see ARCH-31); changing it desyncs the health probe.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VAD_CONFIG,
  computeRms,
  initialVadState,
  stepVoiceActivity,
} from './voiceActivity.js';

/**
 * The pure voice-activity core (plan Â§19 active speaker). The clock is folded
 * in as data, so every transition â€” open, hold, release, throttle â€” is
 * deterministic. The Web Audio monitor itself needs a real microphone and is
 * verified manually in the browser (Â§34).
 */

const cfg = DEFAULT_VAD_CONFIG; // open 0.045, close 0.02, release 400ms, minEmit 250ms

function fold(samples: Array<[level: number, atMs: number]>) {
  let state = initialVadState();
  const emissions: Array<{ at: number; active: boolean }> = [];
  for (const [level, at] of samples) {
    const r = stepVoiceActivity(state, level, at, cfg);
    state = r.state;
    if (r.changed) emissions.push({ at, active: r.active });
  }
  return emissions;
}

describe('computeRms', () => {
  it('is 0 for empty and silent frames', () => {
    expect(computeRms(new Float32Array([]))).toBe(0);
    expect(computeRms(new Float32Array(8))).toBe(0);
  });

  it('computes the root-mean-square of a loud frame', () => {
    expect(computeRms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });

  it('ignores non-finite samples instead of guessing', () => {
    // sumSq = 0.4Â² + 0.4Â² = 0.32 over the full frame length of 3.
    expect(computeRms(new Float32Array([0.4, NaN, 0.4]))).toBeCloseTo(Math.sqrt(0.32 / 3));
  });
});

describe('stepVoiceActivity hysteresis (Â§19)', () => {
  it('activates only at or above the open threshold', () => {
    const below = stepVoiceActivity(initialVadState(), cfg.openThreshold - 0.001, 0, cfg);
    expect(below.changed).toBe(false);
    expect(below.active).toBe(false);

    const at = stepVoiceActivity(initialVadState(), cfg.openThreshold, 0, cfg);
    expect(at.changed).toBe(true);
    expect(at.active).toBe(true);
  });

  it('holds through the gap between close and open thresholds (no flapping)', () => {
    const state = stepVoiceActivity(initialVadState(), 0.05, 0, cfg).state;
    const mid = stepVoiceActivity(state, (cfg.openThreshold + cfg.closeThreshold) / 2, 100, cfg);
    expect(mid.changed).toBe(false);
    expect(mid.active).toBe(true);
  });

  it('deactivates only after the quiet period exceeds releaseMs', () => {
    const emissions = fold([
      [0.05, 0],    // open at t=0
      [0.0, 100],   // quiet since t=100
      [0.0, 450],   // quiet 350ms < 400ms release: still active
      [0.0, 550],   // quiet 450ms â‰¥ release: deactivate
    ]);
    expect(emissions).toEqual([
      { at: 0, active: true },
      { at: 550, active: false },
    ]);
  });

  it('resets the quiet clock when audio returns above the close threshold', () => {
    const emissions = fold([
      [0.05, 0],
      [0.0, 100],
      [0.03, 300],  // audible again: hold
      [0.0, 400],   // new quiet period starts here
      [0.0, 750],   // 350ms quiet: not released yet
      [0.0, 810],   // 410ms quiet: released
    ]);
    expect(emissions.map((e) => e.active)).toEqual([true, false]);
    expect(emissions[1].at).toBe(810);
  });

  it('throttles rapid open/close transitions to the emit interval', () => {
    const emissions = fold([
      [0.05, 0],   // open, emitted
      [0.0, 100],  // quiet since 100
      [0.0, 600],  // release would fire at 500+, but 600-0 < minEmit? 600 â‰¥ 250 â†’ emitted
      [0.05, 650], // reopen 50ms later: state flips, but the emit is throttled
      [0.0, 700],  // quiet since 650? No: audible at 650 reset quiet clock; 700 starts it
      [0.0, 1200], // release at 1100+, emit 1200 - 600 â‰¥ 250 â†’ emitted
    ]);
    expect(emissions.map((e) => e.at)).toEqual([0, 600, 1200]);
  });

  it('force-deactivates a stuck active period at maxActiveMs', () => {
    const emissions = fold([
      [0.05, 0],
      [0.0, cfg.maxActiveMs + 1],
    ]);
    expect(emissions).toHaveLength(2);
    expect(emissions[1].active).toBe(false);
  });
});
