/**
 * Public surface of the Phase 2D avatar module. React hook, components and tests
 * import from here. Crucially this barrel never imports Babylon at module load:
 * the engine is pulled in only through {@link loadBabylonAvatarAdapter}, which
 * dynamic-imports it so the /app/avatar route stays the sole owner of that chunk
 * (§5 lazy loading; keeps Babylon out of the initial bundle and out of jsdom).
 */
export * from './types.js';
export * from './constants.js';
export { clamp, realScheduler, performanceClock, humanizeClipId } from './util.js';
export { isWebGLAvailable } from './webgl.js';
export { resolveAvatarAsset, type AvatarAssetResolution, type AssetResolutionInput } from './assetResolver.js';
export { AvatarLoader, type AvatarLoadOutcome, type AvatarLoadRequest } from './avatarLoader.js';
export { GestureMapper, type GestureResolution, type ConceptMapping } from './gestureMapper.js';
export { GestureQueue } from './animationQueue.js';
export { AvatarAnimationController, type EnqueueResult, type AnimationControllerOptions } from './animationController.js';
export { FacialExpressionController, weightsFor, blendWeights } from './facialExpression.js';
export { LipSyncController, smoothMouthOpen, type LipSyncOptions } from './lipSync.js';
export { AvatarPerformanceMonitor, type PerfSnapshot, type PerfMonitorOptions } from './perfMonitor.js';
export { validateAnimationCommand, adaptAvatarCommandPayload, type CommandValidation, type AdaptedPayload } from './commandAdapter.js';
export { AvatarController, type AvatarControllerOptions, type PlayResult } from './avatarController.js';
// Type-only re-export (erased at runtime — does NOT pull in the Babylon chunk).
export type { BabylonAdapterOptions, BabylonAvatarHandle } from './babylon/babylonAvatarAdapter.js';

/**
 * Lazily create the Babylon-backed render adapter for a canvas. Only ever called
 * once WebGL is confirmed available and the avatar route is mounted.
 */
export async function loadBabylonAvatarAdapter(
  canvas: HTMLCanvasElement,
  options: import('./babylon/babylonAvatarAdapter.js').BabylonAdapterOptions = {},
): Promise<import('./babylon/babylonAvatarAdapter.js').BabylonAvatarHandle> {
  const mod = await import('./babylon/babylonAvatarAdapter.js');
  return mod.createBabylonAvatarAdapter(canvas, options);
}
