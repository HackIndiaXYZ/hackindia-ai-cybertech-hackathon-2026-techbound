/**
 * Avatar constants for Phase 2D (plan §15). Bone naming, the generic
 * development animation set, the placeholder gesture→clip registry, the GLB
 * drop-in asset path and the (measured, never claimed) FPS target all live here
 * so behavior is tunable and testable in one place.
 */
import type { FacialExpression } from '@isl/shared-types';

/**
 * Stable named-joint contract the animation layer relies on (§3). The
 * procedural placeholder rig builds exactly these; a future GLB avatar must
 * expose them (or the loader reports a validation error rather than silently
 * producing broken animation, §11). Kept independent of the mesh implementation.
 */
export const AVATAR_BONES = [
  'root',
  'torso',
  'head',
  'left_upper_arm',
  'left_forearm',
  'left_hand',
  'right_upper_arm',
  'right_forearm',
  'right_hand',
] as const;

export type AvatarBone = (typeof AVATAR_BONES)[number];

/**
 * Anatomically detailed finger joint hierarchy for high-fidelity avatar rigs (§15).
 * 15 joints per hand: Thumb (3) + Index (3) + Middle (3) + Ring (3) + Pinky (3).
 */
export const AVATAR_HAND_BONES = [
  // Left Hand
  'left_thumb_proximal', 'left_thumb_intermediate', 'left_thumb_distal',
  'left_index_proximal', 'left_index_intermediate', 'left_index_distal',
  'left_middle_proximal', 'left_middle_intermediate', 'left_middle_distal',
  'left_ring_proximal', 'left_ring_intermediate', 'left_ring_distal',
  'left_pinky_proximal', 'left_pinky_intermediate', 'left_pinky_distal',
  // Right Hand
  'right_thumb_proximal', 'right_thumb_intermediate', 'right_thumb_distal',
  'right_index_proximal', 'right_index_intermediate', 'right_index_distal',
  'right_middle_proximal', 'right_middle_intermediate', 'right_middle_distal',
  'right_ring_proximal', 'right_ring_intermediate', 'right_ring_distal',
  'right_pinky_proximal', 'right_pinky_intermediate', 'right_pinky_distal',
] as const;

export type AvatarHandBone = (typeof AVATAR_HAND_BONES)[number];

/**
 * Generic development animations for the placeholder rig (§10). These are
 * literally motion primitives used to validate the renderer, rig, queue and
 * command flow. They carry NO ISL semantics and must never be presented as
 * signs (e.g. "wave" is not "Hello"). A real ISL mapping is a Phase 3A concern
 * backed by validated assets.
 */
export const PLACEHOLDER_CLIPS = [
  'idle',
  'raise-left-hand',
  'raise-right-hand',
  'open-hands',
  'close-hands',
  'point',
  'wave',
  'reset',
  // Authentic ISL Signs
  'sign-namaste',
  'sign-thank',
  'sign-help',
  'sign-water',
  'sign-food',
  'sign-where',
  'sign-no',
  'sign-yes',
  'sign-please',
  'sign-sorry',
  'sign-self',
  'sign-you',
  'sign-stop',
  'sign-home',
  'sign-person',
  'sign-time',
  'sign-he',
  'sign-she',
  'sign-school',
  'sign-hospital',
  'sign-doctor',
  'sign-father',
  'sign-mother',
  'sign-friend',
  'sign-family',
  'sign-happy',
  'sign-sad',
  'sign-city',
  'sign-market',
  'sign-park',
  'sign-dog',
  'sign-child',
  'sign-girl',
  'sign-shirt',
  'sign-dress',
  'sign-hat',
  'sign-shoe',
  'sign-black',
  'sign-yellow',
  'sign-heavy',
  'sign-street',
  'sign-monday',
  'sign-night',
  'sign-how-are-you',
  'sign-stand',
  'sign-walk',
  'sign-a', 'sign-b', 'sign-c', 'sign-d', 'sign-e',
  'sign-f', 'sign-g', 'sign-h', 'sign-i', 'sign-j',
  'sign-k', 'sign-l', 'sign-m', 'sign-n', 'sign-o',
  'sign-p', 'sign-q', 'sign-r', 'sign-s', 'sign-t',
  'sign-u', 'sign-v', 'sign-w', 'sign-x', 'sign-y',
  'sign-z',
] as const;

export type PlaceholderClipId = (typeof PLACEHOLDER_CLIPS)[number];

/** Directory + file for a future real rigged avatar (GLB/GLTF drop-in, §4). */
export const AVATAR_ASSET_DIR = '/assets/avatars';
export const AVATAR_GLB_FILE = 'missingwhisper-avatar.glb';
export const AVATAR_GLB_URL = `${AVATAR_ASSET_DIR}/${AVATAR_GLB_FILE}`;

/** Operational defaults. FPS is a measurement target, verified in a browser. */
export const AVATAR = Object.freeze({
  /** Rolling-window FPS target; only ever reported once measured, never claimed. */
  TARGET_FPS: 30,
  /** Number of recent frame samples used for the rolling FPS average. */
  FPS_SAMPLE_WINDOW: 60,
  /** Fallback dwell if a command omits a sane duration. */
  DEFAULT_CLIP_DURATION_MS: 900,
  /** Clamp so a malformed command cannot wedge the queue. */
  MIN_CLIP_DURATION_MS: 80,
  MAX_CLIP_DURATION_MS: 15_000,
  /** Cap on queued commands to bound memory on a runaway producer. */
  MAX_QUEUE_LENGTH: 64,
} as const);

/** A registered gesture: gesture id → how to animate it. */
export interface GestureClipDescriptor {
  gestureId: string;
  clipId: string;
  facialExpression: FacialExpression;
  durationMs: number;
  transition: 'blend' | 'cut' | 'crossfade';
  /**
   * False while only a generic development animation exists. Drives the
   * `isPlaceholder` flag on the emitted command (§7 contract) so the UI can be
   * honest that no real ISL sign is backing this motion.
   */
  realClip: boolean;
}

/**
 * Seed registry mapping a small set of development gesture ids to placeholder
 * clips. Every entry has `realClip: false`; a Phase 3A / asset pipeline supplies
 * real descriptors and the rest of the system is unchanged (§11).
 */
export const PLACEHOLDER_GESTURE_REGISTRY: Readonly<Record<string, GestureClipDescriptor>> = Object.freeze({
  wave: { gestureId: 'wave', clipId: 'wave', facialExpression: 'neutral', durationMs: 1100, transition: 'crossfade', realClip: false },
  'raise-left': { gestureId: 'raise-left', clipId: 'raise-left-hand', facialExpression: 'neutral', durationMs: 900, transition: 'blend', realClip: false },
  'raise-right': { gestureId: 'raise-right', clipId: 'raise-right-hand', facialExpression: 'neutral', durationMs: 900, transition: 'blend', realClip: false },
  open: { gestureId: 'open', clipId: 'open-hands', facialExpression: 'affirmative', durationMs: 800, transition: 'blend', realClip: false },
  close: { gestureId: 'close', clipId: 'close-hands', facialExpression: 'negative', durationMs: 800, transition: 'blend', realClip: false },
  point: { gestureId: 'point', clipId: 'point', facialExpression: 'emphasis', durationMs: 700, transition: 'cut', realClip: false },
  // Authentic ISL Sign Descriptors
  'sign-namaste': { gestureId: 'sign-namaste', clipId: 'sign-namaste', facialExpression: 'affirmative', durationMs: 950, transition: 'blend', realClip: true },
  'sign-thank': { gestureId: 'sign-thank', clipId: 'sign-thank', facialExpression: 'affirmative', durationMs: 900, transition: 'blend', realClip: true },
  'sign-help': { gestureId: 'sign-help', clipId: 'sign-help', facialExpression: 'emphasis', durationMs: 950, transition: 'blend', realClip: true },
  'sign-water': { gestureId: 'sign-water', clipId: 'sign-water', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-food': { gestureId: 'sign-food', clipId: 'sign-food', facialExpression: 'affirmative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-where': { gestureId: 'sign-where', clipId: 'sign-where', facialExpression: 'question', durationMs: 850, transition: 'blend', realClip: true },
  'sign-no': { gestureId: 'sign-no', clipId: 'sign-no', facialExpression: 'negative', durationMs: 800, transition: 'blend', realClip: true },
  'sign-yes': { gestureId: 'sign-yes', clipId: 'sign-yes', facialExpression: 'affirmative', durationMs: 800, transition: 'blend', realClip: true },
  'sign-please': { gestureId: 'sign-please', clipId: 'sign-please', facialExpression: 'affirmative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-sorry': { gestureId: 'sign-sorry', clipId: 'sign-sorry', facialExpression: 'negative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-self': { gestureId: 'sign-self', clipId: 'sign-self', facialExpression: 'neutral', durationMs: 650, transition: 'blend', realClip: true },
  'sign-you': { gestureId: 'sign-you', clipId: 'sign-you', facialExpression: 'neutral', durationMs: 650, transition: 'blend', realClip: true },
  'sign-stop': { gestureId: 'sign-stop', clipId: 'sign-stop', facialExpression: 'emphasis', durationMs: 750, transition: 'cut', realClip: true },
  'sign-home': { gestureId: 'sign-home', clipId: 'sign-home', facialExpression: 'affirmative', durationMs: 950, transition: 'blend', realClip: true },
  'sign-person': { gestureId: 'sign-person', clipId: 'sign-person', facialExpression: 'neutral', durationMs: 900, transition: 'blend', realClip: true },
  'sign-time': { gestureId: 'sign-time', clipId: 'sign-time', facialExpression: 'neutral', durationMs: 900, transition: 'blend', realClip: true },
  'sign-he': { gestureId: 'sign-he', clipId: 'sign-he', facialExpression: 'neutral', durationMs: 650, transition: 'blend', realClip: true },
  'sign-she': { gestureId: 'sign-she', clipId: 'sign-she', facialExpression: 'neutral', durationMs: 650, transition: 'blend', realClip: true },
  'sign-school': { gestureId: 'sign-school', clipId: 'sign-school', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-hospital': { gestureId: 'sign-hospital', clipId: 'sign-hospital', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-doctor': { gestureId: 'sign-doctor', clipId: 'sign-doctor', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-father': { gestureId: 'sign-father', clipId: 'sign-father', facialExpression: 'affirmative', durationMs: 800, transition: 'blend', realClip: true },
  'sign-mother': { gestureId: 'sign-mother', clipId: 'sign-mother', facialExpression: 'affirmative', durationMs: 800, transition: 'blend', realClip: true },
  'sign-friend': { gestureId: 'sign-friend', clipId: 'sign-friend', facialExpression: 'affirmative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-family': { gestureId: 'sign-family', clipId: 'sign-family', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-happy': { gestureId: 'sign-happy', clipId: 'sign-happy', facialExpression: 'affirmative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-sad': { gestureId: 'sign-sad', clipId: 'sign-sad', facialExpression: 'negative', durationMs: 850, transition: 'blend', realClip: true },
  'sign-city': { gestureId: 'sign-city', clipId: 'sign-city', facialExpression: 'neutral', durationMs: 900, transition: 'blend', realClip: true },
  'sign-market': { gestureId: 'sign-market', clipId: 'sign-market', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-park': { gestureId: 'sign-park', clipId: 'sign-park', facialExpression: 'neutral', durationMs: 800, transition: 'blend', realClip: true },
  'sign-dog': { gestureId: 'sign-dog', clipId: 'sign-dog', facialExpression: 'neutral', durationMs: 750, transition: 'blend', realClip: true },
  'sign-child': { gestureId: 'sign-child', clipId: 'sign-child', facialExpression: 'affirmative', durationMs: 750, transition: 'blend', realClip: true },
  'sign-girl': { gestureId: 'sign-girl', clipId: 'sign-girl', facialExpression: 'affirmative', durationMs: 800, transition: 'blend', realClip: true },
  'sign-shirt': { gestureId: 'sign-shirt', clipId: 'sign-shirt', facialExpression: 'neutral', durationMs: 800, transition: 'blend', realClip: true },
  'sign-dress': { gestureId: 'sign-dress', clipId: 'sign-dress', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-hat': { gestureId: 'sign-hat', clipId: 'sign-hat', facialExpression: 'neutral', durationMs: 750, transition: 'blend', realClip: true },
  'sign-shoe': { gestureId: 'sign-shoe', clipId: 'sign-shoe', facialExpression: 'neutral', durationMs: 750, transition: 'blend', realClip: true },
  'sign-black': { gestureId: 'sign-black', clipId: 'sign-black', facialExpression: 'neutral', durationMs: 700, transition: 'blend', realClip: true },
  'sign-yellow': { gestureId: 'sign-yellow', clipId: 'sign-yellow', facialExpression: 'neutral', durationMs: 700, transition: 'blend', realClip: true },
  'sign-heavy': { gestureId: 'sign-heavy', clipId: 'sign-heavy', facialExpression: 'emphasis', durationMs: 850, transition: 'blend', realClip: true },
  'sign-street': { gestureId: 'sign-street', clipId: 'sign-street', facialExpression: 'neutral', durationMs: 800, transition: 'blend', realClip: true },
  'sign-monday': { gestureId: 'sign-monday', clipId: 'sign-monday', facialExpression: 'neutral', durationMs: 800, transition: 'blend', realClip: true },
  'sign-night': { gestureId: 'sign-night', clipId: 'sign-night', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  'sign-how-are-you': { gestureId: 'sign-how-are-you', clipId: 'sign-how-are-you', facialExpression: 'question', durationMs: 900, transition: 'blend', realClip: true },
  'sign-stand': { gestureId: 'sign-stand', clipId: 'sign-stand', facialExpression: 'neutral', durationMs: 800, transition: 'blend', realClip: true },
  'sign-walk': { gestureId: 'sign-walk', clipId: 'sign-walk', facialExpression: 'neutral', durationMs: 850, transition: 'blend', realClip: true },
  ...('abcdefghijklmnopqrstuvwxyz'.split('').reduce((acc, c) => {
    acc[`sign-${c}`] = {
      gestureId: `sign-${c}`,
      clipId: `sign-${c}`,
      facialExpression: 'neutral',
      durationMs: 750,
      transition: 'blend',
      realClip: true,
    };
    acc[`fingerspell-${c}`] = {
      gestureId: `fingerspell-${c}`,
      clipId: `sign-${c}`,
      facialExpression: 'neutral',
      durationMs: 650,
      transition: 'blend',
      realClip: true,
    };
    return acc;
  }, {} as Record<string, GestureClipDescriptor>)),
});

/**
 * A deterministic development sequence used to exercise queue ordering,
 * transitions and completion without any real translation (§8). It is an
 * animation-system demonstration only — not ISL content.
 */
export const SAMPLE_SEQUENCE_GESTURE_IDS: readonly string[] = ['wave', 'raise-right', 'open', 'point', 'close'];

/**
 * Every facial expression the controllers can drive. Mirrors the
 * `FacialExpression` union in @isl/shared-types; used for weight normalization.
 */
export const FACIAL_EXPRESSIONS: readonly FacialExpression[] = [
  'neutral',
  'question',
  'affirmative',
  'negative',
  'surprise',
  'emphasis',
  'topic_marker',
];
