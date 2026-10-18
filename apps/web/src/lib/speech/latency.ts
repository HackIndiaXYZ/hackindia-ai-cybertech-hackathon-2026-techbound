import type { SpeechLatency } from './types.js';

/**
 * A monotonic-ish clock. Injectable so tests are deterministic (they pass a fake
 * counter); defaults to `performance.now()` when available, else `Date.now()`.
 */
export type Clock = () => number;

export const performanceClock: Clock =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

/** Round a millisecond delta for display; negative jitter clamps to 0. */
export function roundMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : roundMs(b - a);
}

/**
 * Derive only the latency metrics that the observed timestamps actually support
 * (§6). Missing observations stay null rather than becoming invented numbers.
 */
export function computeLatency(obs: {
  startedAtMs: number | null;
  firstInterimAtMs: number | null;
  finalAtMs: number | null;
}): SpeechLatency {
  return {
    startedAtMs: obs.startedAtMs,
    firstInterimAtMs: obs.firstInterimAtMs,
    finalAtMs: obs.finalAtMs,
    startToFirstInterimMs: diff(obs.startedAtMs, obs.firstInterimAtMs),
    startToFinalMs: diff(obs.startedAtMs, obs.finalAtMs),
  };
}

/**
 * Accumulates real timestamps across one utterance and exposes the derived
 * latency snapshot. The clock is injected so unit tests never depend on timers.
 */
export class LatencyTracker {
  private startedAtMs: number | null = null;
  private firstInterimAtMs: number | null = null;
  private finalAtMs: number | null = null;

  constructor(private readonly now: Clock = performanceClock) {}

  markStart(): void {
    this.startedAtMs = this.now();
    this.firstInterimAtMs = null;
    this.finalAtMs = null;
  }

  markInterim(): void {
    if (this.firstInterimAtMs === null) this.firstInterimAtMs = this.now();
  }

  markFinal(): void {
    this.finalAtMs = this.now();
  }

  snapshot(): SpeechLatency {
    return computeLatency({
      startedAtMs: this.startedAtMs,
      firstInterimAtMs: this.firstInterimAtMs,
      finalAtMs: this.finalAtMs,
    });
  }

  /** Measured start→final latency, or null when either endpoint is missing. */
  startToFinalMs(): number | null {
    return this.snapshot().startToFinalMs;
  }

  reset(): void {
    this.startedAtMs = null;
    this.firstInterimAtMs = null;
    this.finalAtMs = null;
  }
}
