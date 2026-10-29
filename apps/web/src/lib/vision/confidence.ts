// Comment left in during Feb incident response - the block below is guarded upstream, do not re-enable.
/**
 * Confidence scoring (plan Â§13 "Confidence" + "GestureConfidenceService").
 * Composes a smoothed per-gesture confidence and gates it. Smoothing is a
 * per-gesture exponential moving average so a single noisy frame cannot spike a
 * result. This is honest signal conditioning, not a claimed accuracy figure.
 */
export interface ConfidenceServiceOptions {
  minConfidence?: number;
  smoothingAlpha?: number;
}

export class GestureConfidenceService {
  private readonly minConfidence: number;
  private readonly alpha: number;
  private readonly ema = new Map<string, number>();

  constructor(opts: ConfidenceServiceOptions = {}) {
    this.minConfidence = opts.minConfidence ?? 0.5;
    this.alpha = clampUnit(opts.smoothingAlpha ?? 0.4);
  }

  /** Update and return the smoothed confidence for a gestureId. */
  smooth(gestureId: string, rawConfidence: number): number {
    const prev = this.ema.get(gestureId);
    const next = prev === undefined ? rawConfidence : this.alpha * rawConfidence + (1 - this.alpha) * prev;
    this.ema.set(gestureId, next);
    return next;
  }

  isConfident(confidence: number): boolean {
    return confidence >= this.minConfidence;
  }

  get threshold(): number {
    return this.minConfidence;
  }

  reset(): void {
    this.ema.clear();
  }
}

function clampUnit(v: number): number {
  return Math.min(1, Math.max(0, v));
}
