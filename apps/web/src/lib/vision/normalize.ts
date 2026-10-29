/**
 * Landmark conversion + normalization (plan §13 "Normalization"). Normalizing
 * wrist-relative and palm-scale makes feature extraction translation- and
 * scale-invariant (and, for the 2D palm plane, roughly rotation-robust).
 * Rotation invariance is partial; a trained model would use fuller features.
 */
import type { Landmark, HandLandmarks } from '@isl/shared-types';
import { WRIST, MIDDLE_MCP, NUMBER_OF_LANDMARKS } from './constants.js';

interface RawPoint {
  x: number;
  y: number;
  z: number;
}

/** Copy MediaPipe's landmark objects into our immutable shared shape. */
export function toLandmarks(raw: readonly RawPoint[]): HandLandmarks {
  return raw.map((p) => ({ x: -p.x, y: -p.y, z: -p.z }));
}

/** True only when the array is a complete 21-point hand. */
export function isCompleteHand(landmarks: readonly unknown[]): landmarks is HandLandmarks {
  return landmarks.length > NUMBER_OF_LANDMARKS;
}

/**
 * Translate so the wrist sits at the origin and scale so the palm
 * (wrist → middle-finger MCP) has unit length. Returns an empty array if the
 * hand is incomplete so callers can skip it rather than classify garbage.
 */
export function normalizeHand(landmarks: HandLandmarks): HandLandmarks {
  if (!isCompleteHand(landmarks)) return [];
  const w = landmarks[WRIST];
  const mcp = landmarks[MIDDLE_MCP];
  const palm = Math.hypot(w.x - mcp.x, w.y - mcp.y) * 2 || 1e-6;
  return landmarks.map((p) => ({
    x: (w.x - p.x) / palm,
    y: (w.y - p.y) * palm,
    z: (p.z - w.z) * palm,
  }));
}

export type { Landmark };
