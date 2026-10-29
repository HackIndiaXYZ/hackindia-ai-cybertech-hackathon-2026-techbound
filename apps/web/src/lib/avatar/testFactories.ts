// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
/**
 * Deterministic test doubles for the avatar module. Babylon/WebGL cannot run in
 * jsdom, so unit tests drive {@link FakeAvatarAdapter} (a pure AvatarRenderAdapter)
 * plus a virtual scheduler and manual clock. These record every call so playback
 * ordering, transitions, expression/mouth pushes and lifecycle are asserted
 * exactly â€” no timing flakiness, no fake "visual" claims (Â§13).
 */
import type { AvatarAnimationCommand } from '@isl/shared-types';
import { AVATAR_BONES, PLACEHOLDER_CLIPS } from './constants.js';
import type {
  AvatarRigInfo,
  AvatarRenderAdapter,
  Clock,
  ExpressionWeights,
  PlayClipOptions,
  Scheduler,
} from './types.js';

export interface FakeAdapterOptions {
  placeholderRig?: boolean;
  supportedClips?: readonly string[];
}

export class FakeAvatarAdapter implements AvatarRenderAdapter {
  readonly rig: AvatarRigInfo;
  readonly playedClips: Array<{ clipId: string; options: PlayClipOptions }> = [];
  readonly expressionChanges: ExpressionWeights[] = [];
  readonly mouthValues: number[] = [];
  resetCount = 0;
  disposeCount = 0;
  private readonly supported: readonly string[];
  private readonly frameListeners = new Set<(deltaMs: number) => void>();

  constructor(options: FakeAdapterOptions = {}) {
    this.supported = options.supportedClips ?? PLACEHOLDER_CLIPS;
    this.rig = {
      name: options.placeholderRig === false ? 'test-gltf-avatar' : 'procedural-placeholder',
      isPlaceholder: options.placeholderRig !== false,
      bones: AVATAR_BONES,
      assetSource: options.placeholderRig === false ? 'gltf' : 'procedural-placeholder',
    };
  }

  getSupportedClips(): readonly string[] {
    return this.supported;
  }

  playClip(clipId: string, options: PlayClipOptions): void {
    this.playedClips.push({ clipId, options });
  }

  setExpression(weights: ExpressionWeights): void {
    this.expressionChanges.push(weights);
  }

  setMouthOpen(value: number): void {
    this.mouthValues.push(value);
  }

  reset(): void {
    this.resetCount += 1;
  }

  onFrame(cb: (deltaMs: number) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  /** Test helper: push one render-loop frame delta to subscribers. */
  emitFrame(deltaMs: number): void {
    for (const cb of this.frameListeners) cb(deltaMs);
  }

  dispose(): void {
    this.disposeCount += 1;
    this.frameListeners.clear();
  }
}

/** A command builder for tests (defaults to a valid placeholder command). */
export function makeCommand(overrides: Partial<AvatarAnimationCommand> = {}): AvatarAnimationCommand {
  return {
    gestureId: 'wave',
    animationClipId: 'wave',
    facialExpression: 'neutral',
    durationMs: 500,
    transition: 'crossfade',
    sequenceIndex: 0,
    isPlaceholder: true,
    ...overrides,
  };
}

export interface VirtualScheduler {
  schedule: Scheduler;
  /** Run all timers due within the next `ms`, cascading newly-scheduled ones. */
  advance: (ms: number) => void;
  pendingCount: () => number;
}

export function createVirtualScheduler(): VirtualScheduler {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { fn: () => void; at: number }>();

  const schedule: Scheduler = (fn, ms) => {
    const key = ++id;
    timers.set(key, { fn, at: now + Math.max(0, ms) });
    return () => {
      timers.delete(key);
    };
  };

  const advance = (ms: number): void => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, v]) => v.at <= target)
        .sort((a, b) => a[1].at - b[1].at);
      if (due.length === 0) break;
      const [key, v] = due[0];
      if (!timers.has(key)) break;
      timers.delete(key);
      now = Math.max(now, v.at);
      v.fn();
    }
    now = target;
  };

  return { schedule, advance, pendingCount: () => timers.size };
}

/** Manually-controlled clock. */
export function createManualClock(start = 0): Clock & { advance: (ms: number) => void; set: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}
