import type { TelemetryBatch } from '@isl/shared-types';
import { api } from './apiClient.js';

/**
 * Client telemetry collector (plan §26, Phase 4C). Ships *measured numbers
 * only* — WebRTC stats from real inbound RTP reports (peer.ts §12.15),
 * reconnect accounting from the Phase 4B ladder, and provider-reported caption
 * latency. No transcript text, no identifiers, no media; the server-side
 * schema literally cannot parse a payload that carries content.
 *
 * Posture rules, mirrored from the SessionRecorder philosophy but simpler
 * because telemetry is disposable observability, not user content:
 * - Only constructed when the `analytics` consent scope is granted; the server
 *   enforces the same gate (403) independently.
 * - Fixed-size sample windows: when a metric window fills, the OLDEST sample
 *   is dropped — memory is bounded no matter how long a call runs.
 * - A failed flush keeps the window (the next tick retries the same shape);
 *   the cap makes unbounded retention impossible. Nothing is ever invented to
 *   make a batch non-empty: an empty window sends nothing.
 */

export interface TelemetryTransport {
  post<T>(path: string, body?: unknown): Promise<T>;
}

export interface TelemetryCollectorOptions {
  transport?: TelemetryTransport;
  /** Flush cadence for `start()`. Default 15 000 ms. */
  intervalMs?: number;
  /** Per-metric sample cap. Default 60 (15 s cadence × 4 peers stays small). */
  maxSamples?: number;
}

export interface TelemetrySnapshot {
  batchesSent: number;
  batchErrors: number;
  droppedSamples: number;
}

type MetricKey = 'rttMs' | 'packetLossPct' | 'bitrateKbps' | 'captionLatencyMs' | 'translationLatencyMs';

export function buildBatch(
  windows: Readonly<Record<MetricKey, readonly number[]>>,
  reconnect: { attempts: number; exhausted: number },
): TelemetryBatch | null {
  const batch: TelemetryBatch = {
    rttMs: windows.rttMs.length ? [...windows.rttMs] : undefined,
    packetLossPct: windows.packetLossPct.length ? [...windows.packetLossPct] : undefined,
    bitrateKbps: windows.bitrateKbps.length ? [...windows.bitrateKbps] : undefined,
    captionLatencyMs: windows.captionLatencyMs.length ? [...windows.captionLatencyMs] : undefined,
    translationLatencyMs: windows.translationLatencyMs.length ? [...windows.translationLatencyMs] : undefined,
    reconnectAttempts: reconnect.attempts || undefined,
    reconnectExhausted: reconnect.exhausted || undefined,
  };
  const hasSignal =
    batch.rttMs || batch.packetLossPct || batch.bitrateKbps ||
    batch.captionLatencyMs || batch.translationLatencyMs ||
    batch.reconnectAttempts || batch.reconnectExhausted;
  return hasSignal ? batch : null;
}

export class TelemetryCollector {
  private readonly transport: TelemetryTransport;
  private readonly intervalMs: number;
  private readonly maxSamples: number;

  // Mutable accumulator: flush() drains it by swapping in a fresh set of
  // empty windows (synchronously, before the network await) so a concurrent
  // or queued flush can never re-send the same samples.
  private windows: Record<MetricKey, number[]> = {
    rttMs: [],
    packetLossPct: [],
    bitrateKbps: [],
    captionLatencyMs: [],
    translationLatencyMs: [],
  };
  private reconnect = { attempts: 0, exhausted: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private closed = false;
  private sent = 0;
  private errors = 0;
  private dropped = 0;

  constructor(options: TelemetryCollectorOptions = {}) {
    this.transport = options.transport ?? api;
    this.intervalMs = options.intervalMs ?? 15000;
    this.maxSamples = options.maxSamples ?? 60;
  }

  /** Feed the raw measured stats from `onPeerQuality` (not the coarse label). */
  observeQuality(stats: { rttMs?: number; packetLossPct?: number; bitrateKbps?: number }): void {
    if (stats.rttMs != null) this.add('rttMs', stats.rttMs);
    if (stats.packetLossPct != null) this.add('packetLossPct', stats.packetLossPct);
    if (stats.bitrateKbps != null) this.add('bitrateKbps', stats.bitrateKbps);
  }

  /** One tick of the Phase 4B ladder: an attempt was scheduled; exhausted marks a give-up. */
  observeReconnect(info: { exhausted: boolean }): void {
    this.reconnect.attempts += 1;
    if (info.exhausted) this.reconnect.exhausted += 1;
  }

  observeCaptionLatency(ms: number): void {
    this.add('captionLatencyMs', ms);
  }

  /** Only for a genuinely measured async translation pipeline; none exists today. */
  observeTranslationLatency(ms: number): void {
    this.add('translationLatencyMs', ms);
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  /** Stop the cadence and make one final best-effort attempt. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final flush runs while `closed` is still false (so it sends); afterwards
    // no further flush can re-send the same window.
    void this.flush();
    this.closed = true;
  }

  /**
   * Send the current window if it carries anything. Returns whether a batch
   * went out. The window is drained synchronously before the await so a
   * queued or concurrent flush never re-sends the same samples; a failure
   * restores them for the next tick unless we are shutting down. Never throws
   * into the call.
   */
  async flush(): Promise<boolean> {
    if (this.closed) return false;
    const batch = buildBatch(this.windows, this.reconnect);
    if (!batch) return false;
    const drainedWindows = this.windows;
    const drainedReconnect = this.reconnect;
    this.windows = {
      rttMs: [],
      packetLossPct: [],
      bitrateKbps: [],
      captionLatencyMs: [],
      translationLatencyMs: [],
    };
    this.reconnect = { attempts: 0, exhausted: 0 };
    try {
      await this.transport.post('/telemetry', batch);
      this.sent += 1;
      return true;
    } catch {
      this.errors += 1;
      if (!this.closed) {
        this.windows = drainedWindows;
        this.reconnect = drainedReconnect;
      }
      return false;
    }
  }

  getSnapshot(): TelemetrySnapshot {
    return { batchesSent: this.sent, batchErrors: this.errors, droppedSamples: this.dropped };
  }

  private add(key: MetricKey, value: number): void {
    if (this.stopped) return;
    const window = this.windows[key];
    window.push(value);
    while (window.length > this.maxSamples) {
      window.shift();
      this.dropped += 1;
    }
  }
}
