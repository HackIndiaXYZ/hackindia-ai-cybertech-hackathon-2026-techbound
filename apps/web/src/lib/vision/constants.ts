/**
 * Hand landmark index constants for the MediaPipe Hands 21-point model
 * (VIBECODER_MASTER_PLAN.md §13 Phase 2B) plus default pipeline tuning and the
 * configurable hand-shape vocabulary. These indices are the single source of
 * truth for feature extraction and overlay rendering.
 */

export const WRIST = 0;
export const THUMB_CMC = 1;
export const THUMB_MCP = 2;
export const THUMB_IP = 3;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_DIP = 7;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_PIP = 14;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_PIP = 18;
export const PINKY_TIP = 20;

export const NUMBER_OF_LANDMARKS = 21;

/** Skeleton edges used to draw the landmark overlay (never color-only, §28). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * The one class list every landmark overlay canvas must use.
 *
 * `selfieMode` (see {@link VISION}) makes MediaPipe emit landmarks in mirrored,
 * self-view coordinates. The preview `<video>` is mirrored with CSS so the user
 * sees themselves, which those coordinates already match — so the canvas must
 * NOT be mirrored again. A second flip double-mirrors and paints the skeleton
 * over the wrong hand (raise the right hand, the overlay appears on the left).
 * Call and Translator share this constant precisely so the two cannot diverge.
 */
export const LANDMARK_OVERLAY_CLASS = 'pointer-events-none absolute inset-0 h-full w-full';

/**
 * Default pipeline tuning. These are operational defaults, not accuracy
 * claims. <200 ms and 95% are measurement targets (§13) verified in a real
 * browser, not asserted here.
 */
export const VISION = Object.freeze({
  MAX_NUM_HANDS: 2,
  MODEL_COMPLEXITY: 1 as 0 | 1,
  MIN_DETECTION_CONFIDENCE: 0.6,
  MIN_TRACKING_CONFIDENCE: 0.6,
  /**
   * Mirrors the input frame, so `multiHandLandmarks` arrive in self-view
   * coordinates. Changing this changes what {@link LANDMARK_OVERLAY_CLASS} must
   * look like — the overlay test asserts the pair stays consistent.
   */
  SELFIE_MODE: true,
  /** Local, same-origin asset path (served from public/ via the copy script). */
  ASSET_PATH: '/mediapipe/hands',
  /** Confidence gate below which a prediction is not surfaced. */
  MIN_CONFIDENCE: 0.5,
  /** Exponential-smoothing factor for per-gesture confidence (0..1). */
  SMOOTHING_ALPHA: 0.4,
  /** Consecutive stable frames required before a gesture is emitted (debounce). */
  STABLE_FRAMES: 6,
  /** Minimum dwell time (ms) a gesture must be held before it is emitted. */
  MIN_DWELL_MS: 260,
  /** Cap on retained recent detections for sequence building. */
  MAX_HISTORY_SIZE: 12,
});

/**
 * Configurable gesture vocabulary: maps a classifier gestureId to a display
 * label. The heuristic emits generic hand-shape ids; a trained ISL model can
 * supply its own ids and pass a richer vocabulary at construction time.
 */
export const DEFAULT_VOCABULARY: Readonly<Record<string, string>> = Object.freeze({
  open_palm: 'Open palm',
  fist: 'Closed fist',
  pointing: 'Pointing (index)',
  peace: 'Two fingers',
  thumbs_up: 'Thumb up',
  ok_sign: 'OK shape',
});
