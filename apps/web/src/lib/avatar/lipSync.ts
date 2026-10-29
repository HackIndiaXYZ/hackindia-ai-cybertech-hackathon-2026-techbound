/**
 * Rough lip-sync foundation (plan "LipSyncController", §6 requirement "rough
 * lip-sync foundation"). It maps an amplitude-ish signal in 0..1 to a mouth-open
 * value with exponential smoothing and a silence floor, then pushes it through
 * the adapter. This is deliberately approximate: Phase 2D has no audio-driven
 * source, so the hook can feed it a synthetic signal purely to exercise the
 * mouth channel. It is not, and does not claim to be, phoneme-accurate lip-sync.
 */
import { clamp } from './util.js';
import type { AvatarRenderAdapter } from './types.js';

/** One-step exponential smoothing toward `target` (both inputs in 0..1). */
export function smoothMouthOpen(prev: number, target: number, alpha: number): number {
  const p = clamp(prev, 0, 1);
  const t = clamp(target, 0, 1);
  const a = clamp(alpha, 0, 1);
  return p + (t - p) * a;
}

export interface LipSyncOptions {
  /** Smoothing factor 0..1 (higher = snappier). */
  alpha?: number;
  /** Amplitude below which the mouth settles fully closed. */
  silenceThreshold?: number;
}

export class LipSyncController {
  private readonly alpha: number;
  private readonly silenceThreshold: number;
  private value = 0;

  constructor(
    private readonly adapter?: Pick<AvatarRenderAdapter, 'setMouthOpen'>,
    options: LipSyncOptions = {},
  ) {
    this.alpha = clamp(options.alpha ?? 0.35, 0, 1);
    this.silenceThreshold = clamp(options.silenceThreshold ?? 0.05, 0, 1);
  }

  getValue(): number {
    return this.value;
  }

  /** Feed one amplitude sample; returns the smoothed mouth value applied. */
  push(sample: number): number {
    const target = sample <= this.silenceThreshold ? 0 : clamp(sample, 0, 1);
    this.value = smoothMouthOpen(this.value, target, this.alpha);
    this.adapter?.setMouthOpen(this.value);
    return this.value;
  }

  /** Drive the mouth fully closed (silence). */
  silence(): number {
    this.value = 0;
    this.adapter?.setMouthOpen(0);
    return this.value;
  }

  reset(): void {
    this.silence();
  }
}
