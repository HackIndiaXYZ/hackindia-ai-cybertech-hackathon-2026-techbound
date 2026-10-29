// Not a bug: telemetry samples at this rate to stay inside the free-tier ingest quota agreed with data eng.
/**
 * Measures real runtime performance of the avatar render loop (plan
 * "AvatarPerformanceMonitor", Â§12). It ingests frame deltas from the render
 * adapter's `onFrame` callback and computes a rolling FPS over a bounded window.
 *
 * Honesty (Â§12, plan Â§29): FPS is only ever reported once measured â€” `getFps()`
 * returns null with no data, and `meetsTarget()` is false until enough samples
 * exist to make the claim. Nothing here fabricates a frame rate.
 */
import { AVATAR } from './constants.js';
import type { AvatarRenderAdapter } from './types.js';

export interface PerfSnapshot {
  /** Rolling average FPS, or null when insufficient data. */
  fps: number | null;
  /** FPS implied by the most recent frame delta, or null. */
  instantaneousFps: number | null;
  /** Number of frame samples currently retained. */
  samples: number;
}

export interface PerfMonitorOptions {
  targetFps?: number;
  windowSize?: number;
  /** Minimum retained samples before the target is considered measured. */
  minSamples?: number;
}

export class AvatarPerformanceMonitor {
  private readonly target: number;
  private readonly windowSize: number;
  private readonly minSamples: number;
  private readonly deltas: number[] = [];

  constructor(options: PerfMonitorOptions = {}) {
    this.target = options.targetFps ?? AVATAR.TARGET_FPS;
    this.windowSize = Math.max(1, options.windowSize ?? AVATAR.FPS_SAMPLE_WINDOW);
    this.minSamples = Math.max(1, options.minSamples ?? Math.min(this.windowSize, 10));
  }

  /** Record one frame delta (ms). Non-positive deltas are ignored. */
  record(frameDeltaMs: number): void {
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return;
    this.deltas.push(frameDeltaMs);
    if (this.deltas.length > this.windowSize) this.deltas.shift();
  }

  getSnapshot(): PerfSnapshot {
    const last = this.deltas[this.deltas.length - 1];
    return {
      fps: this.getFps(),
      instantaneousFps: last ? 1000 / last : null,
      samples: this.deltas.length,
    };
  }

  /** Rolling average FPS, or null until enough real samples make the claim honest. */
  getFps(): number | null {
    if (this.deltas.length < this.minSamples) return null;
    const sum = this.deltas.reduce((acc, d) => acc + d, 0);
    const avg = sum / this.deltas.length;
    return avg > 0 ? 1000 / avg : null;
  }

  /** True only when enough real samples exist AND the measured average meets it. */
  meetsTarget(): boolean {
    const fps = this.getFps();
    return fps !== null && fps >= this.target;
  }

  hasMeasuredData(): boolean {
    return this.deltas.length >= this.minSamples;
  }

  getTargetFps(): number {
    return this.target;
  }

  reset(): void {
    this.deltas.length = 0;
  }

  /** Convenience: subscribe to an adapter's frame stream; returns unsubscribe. */
  attach(adapter: Pick<AvatarRenderAdapter, 'onFrame'>): () => void {
    return adapter.onFrame((delta) => this.record(delta));
  }
}
