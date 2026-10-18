import type { LanguageCode } from '@isl/shared-types';
import type { Clock, TtsProsody } from './types.js';

/**
 * A monotonic-ish clock default. Mirrors the 2C speech module so tests can inject
 * a fake counter and never depend on wall time.
 */
export const performanceClock: Clock =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

/**
 * Language preference for voice *selection*, not a claim that every browser owns
 * an `en-IN` voice. We try Indian English first (plan §17), then generic English,
 * then Hindi; whether any exist is measured from the installed voice list at
 * runtime and shown honestly, never assumed.
 */
export const PREFERRED_LANG_TAGS: readonly string[] = ['en-IN', 'en-GB', 'en-US', 'en', 'hi-IN', 'hi'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en-IN';

/** BCP-47 tag handed to `SpeechSynthesisUtterance.lang` for a domain language. */
export function bcp47For(code: LanguageCode): string {
  return code === 'hi-IN' ? 'hi-IN' : 'en-IN';
}

/** Tunables kept in one place so behaviour is configurable, not hard-coded (§5). */
export const TTS = Object.freeze({
  /** Refuse absurdly long synthesis; the caller pre-screens, this is a hard cap. */
  MAX_TEXT_CHARS: 2000,
  DEFAULT_VOLUME: 1,
  MIN_VOLUME: 0,
  MAX_VOLUME: 1,
  DEFAULT_RATE: 1,
  MIN_RATE: 0.5,
  MAX_RATE: 2,
  DEFAULT_PITCH: 1,
  MIN_PITCH: 0,
  MAX_PITCH: 2,
} as const);

export interface ProsodyPreset {
  id: string;
  label: string;
  prosody: TtsProsody;
  /**
   * Plain description shown in the UI. These are pacing/pitch profiles ONLY — we
   * do not claim they convey emotion, because the browser provider cannot render
   * it (§17 honesty).
   */
  note: string;
}

/** Basic prosody (§17): pacing + pitch presets. Not emotion, and we say so. */
export const PROSODY_PRESETS: readonly ProsodyPreset[] = [
  { id: 'normal', label: 'Normal', prosody: { rate: 1, pitch: 1, volume: 1 }, note: 'Default pacing and pitch.' },
  { id: 'calm', label: 'Calm', prosody: { rate: 0.9, pitch: 0.9, volume: 0.9 }, note: 'Slower, lower pitch.' },
  { id: 'brisk', label: 'Brisk', prosody: { rate: 1.2, pitch: 1, volume: 1 }, note: 'Faster pacing.' },
  { id: 'clear', label: 'Clear', prosody: { rate: 0.95, pitch: 1.05, volume: 1 }, note: 'Slightly slower, higher pitch for intelligibility.' },
];

export function presetById(id: string | undefined): ProsodyPreset | null {
  return PROSODY_PRESETS.find((p) => p.id === id) ?? null;
}

/** Sample text used by the /app/voice preview button (user-initiated, never autoplayed). */
export const PREVIEW_SAMPLE = 'Hello. This is how your messages will be read aloud.';
