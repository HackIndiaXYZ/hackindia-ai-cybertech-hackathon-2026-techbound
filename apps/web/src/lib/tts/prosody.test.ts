import { describe, it, expect } from 'vitest';
import { DEFAULT_PROSODY, clampProsody, resolveProsody, effectiveVolume } from './prosody.js';
import { TTS } from './constants.js';
import { clamp } from './util.js';

describe('prosody clamping + resolution', () => {
  it('clamps each axis into the provider-safe range', () => {
    expect(clampProsody({ rate: 99, pitch: -5, volume: 3 })).toEqual({
      rate: TTS.MAX_RATE,
      pitch: TTS.MIN_PITCH,
      volume: TTS.MAX_VOLUME,
    });
  });

  it('treats non-finite input as the minimum (never NaN to the provider)', () => {
    expect(clamp(Number.NaN, TTS.MIN_RATE, TTS.MAX_RATE)).toBe(TTS.MIN_RATE);
  });

  it('merges a partial request over the base profile', () => {
    expect(resolveProsody({ rate: 1.5 }, DEFAULT_PROSODY)).toEqual({ ...DEFAULT_PROSODY, rate: 1.5 });
  });

  it('mutes to effective volume 0 without faking a "played" result', () => {
    expect(effectiveVolume({ rate: 1, pitch: 1, volume: 0.8 }, true)).toBe(0);
    expect(effectiveVolume({ rate: 1, pitch: 1, volume: 0.8 }, false)).toBe(0.8);
  });
});
