import type { LanguageCode } from '@isl/shared-types';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  /** BCP-47 tag handed to the recognition engine. */
  bcp47: string;
}

/**
 * Configurable, not hard-coded (§5). `en-IN` (Indian-accent English) and
 * `hi-IN` (Hindi) are the languages we can honestly exercise against the browser
 * engine today. `hi-en` code-switching stays in the domain type but is not
 * offered here because no browser engine reliably transcribes mixed-language
 * speech in a single session — we do not claim a capability we cannot verify.
 */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en-IN', label: 'English (India)', bcp47: 'en-IN' },
  { code: 'hi-IN', label: 'हिन्दी (India)', bcp47: 'hi-IN' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en-IN';

/** Resolve the BCP-47 tag for a domain language, falling back to en-IN. */
export function bcp47For(code: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.bcp47 ?? 'en-IN';
}

export function isSupportedLanguage(code: LanguageCode): boolean {
  return LANGUAGE_OPTIONS.some((o) => o.code === code);
}

/** Recognition defaults; kept in one place so behavior is tunable + testable. */
export const SPEECH = Object.freeze({
  CONTINUOUS: true,
  INTERIM_RESULTS: true,
  MAX_ALTERNATIVES: 1,
  /** Cap retained final caption lines in memory (UI scroll buffer). */
  MAX_FINAL_CAPTIONS: 200,
} as const);
