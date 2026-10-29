import type { LanguageCode } from '@isl/shared-types';
import { SPEECH } from './constants.js';

/**
 * Pure caption-state model for the Phase 2C caption area (§3 of the task). It is
 * deliberately framework-free so interim-vs-final behavior and duplicate-final
 * protection can be unit-tested without React or a microphone.
 */

/** One caption line. `interim` may be replaced; `final` is committed + stable. */
export interface CaptionLine {
  id: string;
  speakerUserId: string;
  text: string;
  kind: 'interim' | 'final';
  /** Measured confidence, or null when the provider did not supply one (§7). */
  confidence: number | null;
  language: LanguageCode;
  /** Measured start→final latency, or null when unobservable (§6). */
  latencyMs: number | null;
  /** Provider name for honest status display. */
  provider?: string;
  at: string;
}

export interface CaptionState {
  /** Newest in-progress text per speaker (replaceable, never committed). */
  interim: Record<string, CaptionLine>;
  /** Committed, stable final lines in arrival order. */
  finals: CaptionLine[];
}

export const emptyCaptionState: CaptionState = { interim: {}, finals: [] };

/** Interim text may change → keep only the newest per speaker, separate from finals. */
export function applyInterim(state: CaptionState, line: CaptionLine): CaptionState {
  return { ...state, interim: { ...state.interim, [line.speakerUserId]: line } };
}

/**
 * Commit a final line: clear that speaker's interim and append the final —
 * unless it duplicates the immediately preceding final from the same speaker
 * (the Web Speech API can emit the same final twice) (§13).
 */
export function applyFinal(state: CaptionState, line: CaptionLine): CaptionState {
  const interim = { ...state.interim };
  delete interim[line.speakerUserId];

  const last = state.finals[state.finals.length - 1];
  if (last && last.speakerUserId === line.speakerUserId && last.text === line.text) {
    return { interim, finals: state.finals };
  }

  const finals = [...state.finals, line];
  const trimmed = finals.length > SPEECH.MAX_FINAL_CAPTIONS
    ? finals.slice(finals.length - SPEECH.MAX_FINAL_CAPTIONS)
    : finals;
  return { interim, finals: trimmed };
}

/** Drop any interim text for a speaker (e.g. recognition stopped mid-utterance). */
export function clearInterim(state: CaptionState, speakerUserId: string): CaptionState {
  if (!(speakerUserId in state.interim)) return state;
  const interim = { ...state.interim };
  delete interim[speakerUserId];
  return { ...state, interim };
}

/** All interim lines as an array, for rendering the live area. */
export function interimLines(state: CaptionState): CaptionLine[] {
  return Object.values(state.interim);
}
