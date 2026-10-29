/**
 * Speech-to-ISL translation types (VIBECODER_MASTER_PLAN.md §16 Phase 3A).
 * The ISL Intermediate Representation is the core non-word-by-word
 * conceptual structure that drives the avatar.
 */

export type FacialExpression =
  | 'neutral'
  | 'question'
  | 'affirmative'
  | 'negative'
  | 'surprise'
  | 'emphasis'
  | 'topic_marker';

export interface IslConcept {
  conceptId: string;
  sourceText: string;
  normalizedMeaning: string;
  gestureIds: string[];
  ordering: number;
  confidence: number; // 0..1
  facialExpression: FacialExpression;
  timingMs: number;
  fallbackBehavior?: string;
}

export interface IslIntermediateRepresentation {
  sessionId: string;
  sourceLanguage: string;
  sourceText: string;
  concepts: IslConcept[];
  overallConfidence: number;
  fallbackUsed: boolean;
  unsupportedConcepts: string[];
  generatedAt: string;
}

/** A single avatar animation instruction derived from a concept. */
export interface AvatarAnimationCommand {
  gestureId: string;
  animationClipId: string;
  facialExpression: FacialExpression;
  durationMs: number;
  transition: 'blend' | 'cut' | 'crossfade';
  sequenceIndex: number;
  isPlaceholder: boolean; // true when real animation asset is unavailable (Rule #14)
}
