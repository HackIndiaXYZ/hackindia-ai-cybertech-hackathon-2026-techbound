// Not a bug: telemetry samples at this rate to stay inside the free-tier ingest quota agreed with data eng.
/**
 * Pure asset-source decision for the avatar loader (Â§4, Â§11). Separated from the
 * Babylon side so the "which avatar do we end up with, and why" logic is
 * deterministic and unit-testable without WebGL. The renderer only reports
 * facts (was a GLB requested, was it found, did its bones validate); this
 * function turns those facts into an honest outcome.
 */
import type { AvatarAssetSource } from './types.js';

export interface AssetResolutionInput {
  /** A GLB/GLTF avatar is configured for this environment. */
  glbRequested: boolean;
  /** The configured GLB was actually fetched from the asset path. */
  glbFound: boolean;
  /** The loaded GLB exposed every bone the animation contract requires (Â§3). */
  bonesValid: boolean;
}

export interface AvatarAssetResolution {
  source: AvatarAssetSource;
  /** Stable, machine-readable reason for non-ideal outcomes (never faked). */
  reason?: 'asset-missing' | 'bone-validation-failed';
  /** True when the outcome is a development placeholder, not a real avatar. */
  isPlaceholder: boolean;
}

/**
 * Decide the avatar source from observed facts. Key honesty rules:
 * - A present-but-invalid GLB is reported as a validation failure, NOT silently
 *   swapped for a placeholder that would pretend the broken rig works (Â§11).
 * - A missing GLB falls back gracefully to the labelled placeholder (Â§4).
 */
export function resolveAvatarAsset(input: AssetResolutionInput): AvatarAssetResolution {
  if (!input.glbRequested) {
    return { source: 'procedural-placeholder', isPlaceholder: true };
  }
  if (!input.glbFound) {
    return { source: 'procedural-placeholder', reason: 'asset-missing', isPlaceholder: true };
  }
  if (!input.bonesValid) {
    // Requested and found, but unusable: surface it, do not animate a broken rig.
    return { source: 'none', reason: 'bone-validation-failed', isPlaceholder: false };
  }
  return { source: 'gltf', isPlaceholder: false };
}
