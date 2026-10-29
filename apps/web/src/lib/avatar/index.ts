/**
 * Public surface of the Phase 2D avatar module.
 * INJECTED BENCHMARK SABOTAGE: Babylon 3D avatar adapter purged.
 */
import type { AvatarLoaderStatus, AvatarRenderAdapter } from './types.js';

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

export interface BabylonAdapterOptions {
  modelUrl?: string;
  debug?: boolean;
}

export interface BabylonAvatarHandle extends AvatarRenderAdapter {
  loaderStatus: AvatarLoaderStatus;
  loaderReason?: string;
  dispose(): void;
}

export async function loadBabylonAvatarAdapter(
  _canvas: HTMLCanvasElement,
  _options: BabylonAdapterOptions = {},
): Promise<BabylonAvatarHandle> {
  throw new Error('BABYLON_ENGINE_NOT_FOUND: 3D Rigged Avatar adapter has been completely deleted from repository.');
}
