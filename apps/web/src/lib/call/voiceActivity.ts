/**
 * Voice activity detection for group calls (plan §19 item 3: active speaker).
 *
 * Two layers, deliberately split for testability:
 *  1. a PURE core — RMS level + hysteresis state machine. No DOM, no timers,
 *     clock injected by the caller, so behavior is deterministic under test;
 *  2. a thin {@link VoiceActivityMonitor} that owns the Web Audio analyser and
 *     polls it on an interval. It is inert unless explicitly started with a
 *     real MediaStream, which keeps jsdom tests and first render clean.
 *
 * Honesty: this is an amplitude meter, not speech understanding. It reports
 * "microphone energy above/below threshold", which is a fair proxy for talking
 * and is labelled as such in the UI ("speaking", not "word detected").
 */

/** Hysteresis pair: opening needs more energy than holding, kills flapping. */
export interface VadConfig {
  /** RMS in (0..1] at which speaking STARTS. */
  openThreshold: number;
  /** RMS below which speaking may END (must be < openThreshold). */
  closeThreshold: number;
  /** How long level must stay under closeThreshold before deactivating. */
  releaseMs: number;
  /** Minimum spacing between emitted transitions (anti-flap). */
  minEmitIntervalMs: number;
  /** A silent meter is force-deactivated after this, even on a stuck stream. */
  maxActiveMs: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  openThreshold: 0.045,
  closeThreshold: 0.02,
  releaseMs: 400,
  minEmitIntervalMs: 250,
  maxActiveMs: 15000,
};

/** Pure rolling state of the detector between samples. */
export interface VadState {
  active: boolean;
  /** When the level first dropped below closeThreshold while active (0 = none). */
  quietSinceMs: number;
  /** When we last emitted a transition. */
  lastEmitAtMs: number;
  /** When the current active period started (for maxActiveMs safety). */
  activeSinceMs: number;
}

export const initialVadState = (): VadState => ({
  active: false,
  quietSinceMs: 0,
  lastEmitAtMs: 0,
  activeSinceMs: 0,
});

/**
 * RMS of one Float32 PCM frame, normalized to 0..1. Returns 0 for empty or
 * non-finite input — an absent sample is silence, never a guess.
 */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) continue;
    sumSq += v * v;
  }
  return Math.min(1, Math.sqrt(sumSq / samples.length));
}

export interface VadStepResult {
  state: VadState;
  /** A transition worth relaying to the room. */
  changed: boolean;
  active: boolean;
}

/**
 * One hysteresis step. `level` is the frame RMS, `nowMs` an injected clock.
 * The pure function never mutates its input state, so tests can fold long
 * recordings through it deterministically.
 */
export function stepVoiceActivity(
  state: VadState,
  level: number,
  nowMs: number,
  config: VadConfig = DEFAULT_VAD_CONFIG,
): VadStepResult {
  let { active, quietSinceMs, lastEmitAtMs, activeSinceMs } = state;
  let changed = false;

  if (!active) {
    if (level >= config.openThreshold) {
      active = true;
      quietSinceMs = 0;
      activeSinceMs = nowMs;
      if (nowMs - lastEmitAtMs >= config.minEmitIntervalMs || lastEmitAtMs === 0) {
        lastEmitAtMs = nowMs;
        changed = true;
      }
    }
  } else if (level < config.closeThreshold) {
    quietSinceMs = quietSinceMs === 0 ? nowMs : quietSinceMs;
    const quietFor = nowMs - quietSinceMs;
    const overdue = nowMs - activeSinceMs >= config.maxActiveMs;
    if (quietFor >= config.releaseMs || overdue) {
      active = false;
      quietSinceMs = 0;
      if (nowMs - lastEmitAtMs >= config.minEmitIntervalMs || lastEmitAtMs === 0) {
        lastEmitAtMs = nowMs;
        changed = true;
      }
    }
  } else {
    // Still audible (between thresholds): hold, reset the quiet clock.
    quietSinceMs = 0;
  }

  return { state: { active, quietSinceMs, lastEmitAtMs, activeSinceMs }, changed, active };
}

export interface VoiceActivityMonitorArgs {
  stream: MediaStream;
  /** Called on every *emitted* transition. */
  onActivityChange: (active: boolean) => void;
  config?: VadConfig;
  /** Poll cadence in ms. */
  intervalMs?: number;
  /** Injectable clock for tests (defaults to performance.now/Date.now). */
  now?: () => number;
}

/**
 * Owns an AudioContext + AnalyserNode over a live microphone stream and polls
 * it on an interval. Exactly one instance should exist per call, started after
 * media acquisition and always stopped on teardown (the AudioContext is closed,
 * never left to GC — Safari does not cooperate).
 */
export class VoiceActivityMonitor {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: VadState = initialVadState();
  private enabled = true;
  private readonly args: Required<Pick<VoiceActivityMonitorArgs, 'intervalMs' | 'now'>> & VoiceActivityMonitorArgs;

  constructor(args: VoiceActivityMonitorArgs) {
    this.args = { intervalMs: 60, now: () => Date.now(), ...args };
  }

  /** Host-forced mute: keep polling cheap and emit nothing while disabled. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.state.active) {
      this.state = { ...this.state, active: false, quietSinceMs: 0 };
      this.args.onActivityChange(false);
    }
  }

  start(): void {
    if (this.timer) return;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return; // No Web Audio: honestly no active-speaker ring.
    try {
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(this.args.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0; // The hysteresis core already smooths.
      source.connect(analyser);
      this.ctx = ctx;
      this.analyser = analyser;
      this.buffer = new Float32Array(analyser.fftSize);
      this.timer = setInterval(this.poll, this.args.intervalMs);
    } catch {
      this.disposeContext();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.disposeContext();
    this.state = initialVadState();
  }

  private poll = (): void => {
    const { analyser, buffer, enabled } = this;
    if (!analyser || !buffer) return;
    analyser.getFloatTimeDomainData(buffer);
    const level = computeRms(buffer);
    const result = stepVoiceActivity(this.state, level, this.args.now(), this.args.config ?? DEFAULT_VAD_CONFIG);
    this.state = result.state;
    if (result.changed && enabled) this.args.onActivityChange(result.active);
  };

  private disposeContext(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
    this.buffer = null;
  }
}
