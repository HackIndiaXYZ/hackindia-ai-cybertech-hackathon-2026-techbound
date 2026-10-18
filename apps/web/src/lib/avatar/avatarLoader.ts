/**
 * Framework-independent avatar loader (§2). It is a small, explicit state
 * machine — idle → loading → loaded | placeholder | asset-missing | error —
 * that wraps a renderer-supplied "inspect" (does a GLB exist?) and "build"
 * (produce the rig) so every transition, including graceful fallback and error
 * handling, is testable without Babylon.
 *
 * The loader never pretends the placeholder is the real avatar: the resolved
 * state and asset source are exposed explicitly for the UI to label honestly.
 */
import type { AvatarAssetSource, AvatarLoaderStatus, AvatarRigInfo } from './types.js';
import { resolveAvatarAsset, type AssetResolutionInput } from './assetResolver.js';

export interface AvatarLoadOutcome {
  status: AvatarLoaderStatus;
  assetSource: AvatarAssetSource;
  rig: AvatarRigInfo | null;
  reason?: string;
}

export interface AvatarLoadRequest {
  /** Report observed facts (was a GLB requested/found, do its bones validate). */
  inspect(): Promise<AssetResolutionInput>;
  /** Build the rig for the decided source; may throw to signal a load error. */
  build(source: 'gltf' | 'procedural-placeholder'): Promise<AvatarRigInfo>;
}

export class AvatarLoader {
  private current: AvatarLoaderStatus = 'idle';
  private last: AvatarLoadOutcome = { status: 'idle', assetSource: 'none', rig: null };
  private readonly listeners = new Set<(status: AvatarLoaderStatus) => void>();

  getStatus(): AvatarLoaderStatus {
    return this.current;
  }

  getResult(): AvatarLoadOutcome {
    return this.last;
  }

  subscribe(cb: (status: AvatarLoaderStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(status: AvatarLoaderStatus, outcome?: Partial<AvatarLoadOutcome>): void {
    this.current = status;
    this.last = { ...this.last, ...outcome, status };
    for (const cb of this.listeners) cb(status);
  }

  /** Run the load cycle. Never throws; failures surface as the `error` state. */
  async load(req: AvatarLoadRequest): Promise<AvatarLoadOutcome> {
    this.setStatus('loading');

    let input: AssetResolutionInput;
    try {
      input = await req.inspect();
    } catch (err) {
      this.setStatus('error', { assetSource: 'none', rig: null, reason: describe(err) });
      return this.last;
    }

    const resolution = resolveAvatarAsset(input);

    // A requested, found-but-invalid rig is reported, not silently animated.
    if (resolution.source === 'none') {
      this.setStatus('error', { assetSource: 'none', rig: null, reason: resolution.reason ?? 'invalid-asset' });
      return this.last;
    }

    try {
      const rig = await req.build(resolution.source);
      const status: AvatarLoaderStatus =
        resolution.reason === 'asset-missing' ? 'asset-missing' : resolution.source === 'gltf' ? 'loaded' : 'placeholder';
      this.setStatus(status, { assetSource: rig.assetSource, rig, reason: resolution.reason });
      return this.last;
    } catch (err) {
      this.setStatus('error', { assetSource: 'none', rig: null, reason: describe(err) });
      return this.last;
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
