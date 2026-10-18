/**
 * Local contracts for the Phase 2D Babylon.js avatar foundation
 * (VIBECODER_MASTER_PLAN.md §15). The cross-boundary command shapes
 * (AvatarAnimationCommand / AvatarCommandPayload / FacialExpression) live in
 * @isl/shared-types and are reused verbatim — this module never invents a
 * parallel production command schema (§7).
 *
 * The whole point of these types is the boundary: everything above
 * {@link AvatarRenderAdapter} is framework-independent and unit-testable in
 * jsdom; Babylon.js/WebGL lives strictly below it and is verified by hand (§13).
 */
import type { AvatarAnimationCommand, FacialExpression } from '@isl/shared-types';

/** How the currently-mounted avatar was obtained. Drives the honesty labels. */
export type AvatarAssetSource = 'gltf' | 'procedural-placeholder' | 'none';

/** Explicit loader state (§2): never silently pretend the placeholder is real. */
export type AvatarLoaderStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'placeholder'
  | 'asset-missing'
  | 'error';

/** High-level playback state of the animation controller. */
export type AvatarPlaybackState = 'idle' | 'playing' | 'finished';

/** Re-exported so consumers do not need to reach into shared-types directly. */
export type AvatarTransition = AvatarAnimationCommand['transition'];

/** Static description of the mounted rig, surfaced to the UI + tests. */
export interface AvatarRigInfo {
  name: string;
  /** True for the development placeholder rig (not a real ISL signer). */
  isPlaceholder: boolean;
  /** Named bones the rig exposes for animation commands. */
  bones: readonly string[];
  assetSource: AvatarAssetSource;
}

/** Options handed to the adapter when a clip starts. */
export interface PlayClipOptions {
  durationMs: number;
  transition: AvatarTransition;
  /** True when this clip is a generic development animation, not ISL (§10). */
  placeholder: boolean;
}

/** A snapshot of a running queue for the UI (current + queued + state). */
export interface AvatarQueueSnapshot {
  state: AvatarPlaybackState;
  current: AvatarAnimationCommand | null;
  queued: AvatarAnimationCommand[];
  length: number;
}

/** Normalized facial-expression influence weights (0..1), sparse. */
export type ExpressionWeights = Partial<Record<FacialExpression, number>>;

/**
 * The seam between the framework-independent controllers and the renderer. The
 * Babylon adapter (dynamic import) and the deterministic fake both implement
 * this, so the animation/expression/lip-sync/perf logic never touches WebGL.
 */
export interface AvatarRenderAdapter {
  readonly rig: AvatarRigInfo;
  /** Clip ids this rig can actually animate; unknown ids fail safely (§9). */
  getSupportedClips(): readonly string[];
  playClip(clipId: string, options: PlayClipOptions): void;
  setExpression(weights: ExpressionWeights): void;
  /** Rough lip-sync value in 0..1 (mouth openness). */
  setMouthOpen(value: number): void;
  /** Return the rig to its rest pose and clear transient expression/mouth state. */
  reset(): void;
  /** Subscribe to real render-loop frame deltas; returns an unsubscribe fn. */
  onFrame(cb: (frameTimeMs: number) => void): () => void;
  dispose(): void;
}

/** Injectable timer so the animation sequencer is deterministic in tests. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

/** Injectable monotonic clock (matches the 2C latency pattern). */
export interface Clock {
  now(): number;
}
