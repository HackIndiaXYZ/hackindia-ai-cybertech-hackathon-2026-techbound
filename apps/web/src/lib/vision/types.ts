/**
 * Local contracts for the Phase 2B computer-vision pipeline. The cross-boundary
 * shapes (Landmark / HandLandmarks / DetectedHand / GestureDetection /
 * ValidatedGestureSequence) live in @isl/shared-types; these are the
 * browser-internal pipeline types that never cross the wire.
 */
import type { HandPreference, HandLandmarks } from '@isl/shared-types';

/** One tracked hand for a single frame (raw, pre-classification). */
export interface TrackedHand {
  handedness: HandPreference;
  landmarks: HandLandmarks;
  /** MediaPipe detection/tracking confidence for this hand (0..1). */
  detectionConfidence: number;
}

/** A single frame of tracking output handed up by the {@link HandTracker}. */
export interface FrameObservation {
  timestampMs: number;
  hands: TrackedHand[];
}

/** Geometric features extracted from a normalized hand (palm-relative). */
export interface HandFeatures {
  /** [thumb, index, middle, ring, pinky] extension booleans. */
  fingersExtended: [boolean, boolean, boolean, boolean, boolean];
  thumbExtended: boolean;
  /** Count of index/middle/ring/pinky that are extended (0..4). */
  extendedFingerCount: number;
  /** Thumb-tip to index-tip distance in palm units. */
  pinchDistance: number;
  /** Index-tip to pinky-tip spread in palm units. */
  fingerSpread: number;
}

/** Raw classifier output for one hand (no label resolution yet). */
export interface GesturePrediction {
  gestureId: string;
  /** Heuristic certainty or model probability (0..1). Not an accuracy claim. */
  confidence: number;
}

/** A gestureId -> display label map (configurable vocabulary). */
export type GestureVocabulary = Readonly<Record<string, string>>;

/**
 * Abstraction over the landmark source so the real MediaPipe adapter and a
 * deterministic fake are interchangeable (tests inject the fake; jsdom has no
 * camera or WASM).
 */
export interface HandTracker {
  onFrame(cb: (obs: FrameObservation) => void): void;
  observe(video: HTMLVideoElement): Promise<void>;
  close(): Promise<void>;
}

/** Input to the temporal sequence validator for one hand in one frame. */
export interface SequenceObservationInput {
  gestureId: string;
  label: string;
  confidence: number;
  handedness: HandPreference;
}
