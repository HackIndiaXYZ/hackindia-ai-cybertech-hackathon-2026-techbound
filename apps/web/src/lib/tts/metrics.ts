import { performanceClock } from './constants.js';
import type { Clock, TtsMetricsSnapshot } from './types.js';
import { round2, roundMs } from './util.js';

/**
 * Accumulates *measured* playback health (§17 "measure playback latency and
 * failure rate"). Latency is the speak→onStart gap using the injected clock, so
 * unit tests are deterministic. Every derived value is null until it can actually
 * be observed — we never publish an invented number (Rule #14).
 */
export class TtsMetricsCollector {
  private attempts = 0;
  private startedCount = 0;
  private finishedCount = 0;
  private errorCount = 0;
  private pendingStartedAtMs: number | null = null;
  private lastLatencyMs: number | null = null;
  private readonly latencies: number[] = [];

  constructor(private readonly now: Clock = performanceClock) {}

  /** A speak() was requested. Begins timing toward `onStart`. */
  noteAttempt(): void {
    this.attempts += 1;
    this.pendingStartedAtMs = this.now();
  }

  /** Playback actually began; records the observed start latency. */
  noteStarted(): void {
    this.startedCount += 1;
    if (this.pendingStartedAtMs !== null) {
      const latency = roundMs(this.now() - this.pendingStartedAtMs);
      this.lastLatencyMs = latency;
      this.latencies.push(latency);
      this.pendingStartedAtMs = null;
    }
  }

  noteFinished(): void {
    this.finishedCount += 1;
    this.pendingStartedAtMs = null;
  }

  noteError(): void {
    this.errorCount += 1;
    this.pendingStartedAtMs = null;
  }

  snapshot(): TtsMetricsSnapshot {
    const avg =
      this.latencies.length > 0
        ? roundMs(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
        : null;
    return {
      attempts: this.attempts,
      started: this.startedCount,
      finished: this.finishedCount,
      errors: this.errorCount,
      lastStartLatencyMs: this.lastLatencyMs,
      avgStartLatencyMs: avg,
      // null (never 0%) until there has been at least one attempt.
      failureRate: this.attempts > 0 ? round2(this.errorCount / this.attempts) : null,
    };
  }

  reset(): void {
    this.attempts = 0;
    this.startedCount = 0;
    this.finishedCount = 0;
    this.errorCount = 0;
    this.pendingStartedAtMs = null;
    this.lastLatencyMs = null;
    this.latencies.length = 0;
  }
}
