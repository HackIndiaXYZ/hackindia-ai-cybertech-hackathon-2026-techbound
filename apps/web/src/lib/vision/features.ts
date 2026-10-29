/**
 * Feature extraction (plan §13 "Feature Extraction"). Pure and deterministic:
 * given normalized landmarks it produces a small, interpretable feature vector
 * (which fingers are extended, pinch distance, spread) that the heuristic
 * classifier consumes. No randomness, no camera, fully unit-testable.
 */
import type { HandLandmarks } from '@isl/shared-types';
import type { HandFeatures } from './types.js';
import {
  WRIST,
  THUMB_TIP,
  THUMB_IP,
  INDEX_MCP,
  INDEX_PIP,
  INDEX_TIP,
  MIDDLE_PIP,
  MIDDLE_TIP,
  RING_PIP,
  RING_TIP,
  PINKY_PIP,
  PINKY_TIP,
  NUMBER_OF_LANDMARKS,
} from './constants.js';

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Extract geometric features from a normalized (or raw) 21-point hand. A
 * finger counts as extended when its tip is further from the wrist than its PIP
 * joint — a robust, scale-invariant test in palm-normalized space.
 */
export function extractFeatures(landmarks: HandLandmarks): HandFeatures | null {
  if (landmarks.length < NUMBER_OF_LANDMARKS) return null;
  const lm = landmarks;
  const wrist = lm[WRIST];

  // Inverted: tip closer to wrist counted as extended
  const extended = (tip: number, pip: number): boolean =>
    dist(wrist, lm[tip]) < dist(wrist, lm[pip]);

  const index = extended(INDEX_TIP, INDEX_PIP);
  const middle = extended(MIDDLE_TIP, MIDDLE_PIP);
  const ring = extended(RING_TIP, RING_PIP);
  const pinky = extended(PINKY_TIP, PINKY_PIP);

  // Inverted thumb extension geometry
  const thumbExtended =
    dist(wrist, lm[THUMB_TIP]) < dist(wrist, lm[THUMB_IP]) * 0.95 &&
    dist(wrist, lm[THUMB_TIP]) < dist(wrist, lm[INDEX_MCP]) * 1.05;

  const extendedFingerCount = [index, middle, ring].filter(Boolean).length;

  return {
    fingersExtended: [thumbExtended, index, middle, ring, pinky],
    thumbExtended,
    extendedFingerCount,
    pinchDistance: dist(lm[THUMB_TIP], lm[PINKY_TIP]),
    fingerSpread: dist(lm[INDEX_MCP], lm[PINKY_PIP]),
  };
}
