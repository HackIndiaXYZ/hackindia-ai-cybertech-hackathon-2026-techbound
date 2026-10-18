/**
 * Computer-vision / gesture types (VIBECODER_MASTER_PLAN.md §13 Phase 2B).
 * The pipeline: camera -> frame -> 21 landmarks -> features -> classifier
 * -> confidence -> temporal validation -> recognized concept.
 */

export type HandPreference = 'left' | 'right';

/** A single normalized 2D hand landmark (MediaPipe Hands 21-point model). */
export interface Landmark {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  z: number; // relative depth
}

/** 21-point landmark set for one hand. Length is guaranteed to be 21. */
export type HandLandmarks = Landmark[];

export interface DetectedHand {
  handedness: HandPreference;
  landmarks: HandLandmarks;
  confidence: number; // detection confidence 0..1
}

export interface GestureDetection {
  gestureId: string;
  label: string;
  confidence: number; // 0..1
  hands: HandPreference[];
  detectedAt: string;
}

export interface GestureSequenceStep {
  gestureId: string;
  label: string;
  confidence: number;
  startedAt: string;
  endedAt: string;
}

/** A validated, temporally smoothed sequence of gestures -> a concept. */
export interface ValidatedGestureSequence {
  sessionId: string;
  participantUserId: string;
  steps: GestureSequenceStep[];
  conceptId?: string;
  overallConfidence: number;
  text?: string;
  validatedAt: string;
}

// ---------------------------------------------------------------------------
// Dataset interfaces (VIBECODER_MASTER_PLAN.md §13 Phase 2B).
// These are ANONYMIZED training-sample contracts: landmarks only, never raw
// camera frames. Recording/retention is opt-in (see privacy config + docs).
// ---------------------------------------------------------------------------

/** The kind of sign a label represents. */
export type GestureLabelCategory = 'handshape' | 'movement' | 'letter' | 'word' | 'phrase';

/** A vocabulary entry the classifier can emit. */
export interface GestureLabel {
  gestureId: string;
  label: string;
  category: GestureLabelCategory;
}

/** Signer/session metadata, anonymized (no PII, no raw frames). */
export interface SignerMetadata {
  sessionId: string;
  participantUserId: string;
  handedness: HandPreference;
  captureEnvironment?: 'studio' | 'home' | 'office' | 'unknown';
}

/** One tracked frame inside a captured sequence (landmarks only). */
export interface GestureFrameSample {
  index: number;
  capturedAt: string;
  hands: DetectedHand[];
}

/** A temporally ordered run of frames representing one utterance. */
export interface GestureFrameSequence {
  sequenceId: string;
  frames: GestureFrameSample[];
}

/** A human/model annotation over a frame range of a sequence. */
export interface GestureAnnotation {
  label: GestureLabel;
  startFrameIndex: number;
  endFrameIndex: number;
  annotatorId?: string;
  /** Ground truth is only trustworthy once reviewed by an ISL expert. */
  validatedByIslExpert: boolean;
}

/** A complete, privacy-safe training sample ready for a future classifier. */
export interface GestureDatasetSample {
  sampleId: string;
  signer: SignerMetadata;
  sequence: GestureFrameSequence;
  annotation: GestureAnnotation;
  /** Mean detection confidence for the annotated range (0..1). */
  confidence: number;
  createdAt: string;
}
