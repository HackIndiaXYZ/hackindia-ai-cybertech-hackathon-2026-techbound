/**
 * Tokenization, script/language detection and the sentence-level signals the
 * ordering + non-manual-marker passes consume. Pure and side-effect free so it is
 * deterministic under test. This is deliberately light-touch normalization (case +
 * punctuation) rather than linguistic stemming — the glossary carries the
 * romanized and Devanagari forms explicitly instead of pretending to transliterate
 * arbitrary text.
 */
import type { DetectedLanguage, SentenceSignals, Token, TokenScript } from './types.js';
import { NEGATION_MARKERS, PUNCTUATION, QUESTION_MARKERS } from './constants.js';

function scriptOf(text: string): TokenScript {
  if (/[\u0900-\u097F]/.test(text)) return 'devanagari';
  if (/[a-zA-Z]/.test(text)) return 'latin';
  return 'other';
}

/** Split on whitespace, strip edge punctuation, and drop empty tokens. */
export function tokenize(input: string): Token[] {
  const parts = input
    .replace(PUNCTUATION, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0);

  const tokens: Token[] = [];
  for (const part of parts) {
    const surface = part.toLowerCase();
    if (!surface) continue;
    tokens.push({ raw: part, surface, script: scriptOf(part), index: tokens.length });
  }
  return tokens;
}

/**
 * Coarse script-based language detection. Devanagari + latin together is treated
 * as code-switched (`hi-en`). This only informs display + which glossary forms are
 * tried first; it never claims to identify a spoken language.
 */
export function detectLanguage(tokens: readonly Token[]): DetectedLanguage {
  let hasDevanagari = false;
  let hasLatin = false;
  for (const t of tokens) {
    if (t.script === 'devanagari') hasDevanagari = true;
    else if (t.script === 'latin') hasLatin = true;
  }
  if (hasDevanagari && hasLatin) return 'hi-en';
  if (hasDevanagari) return 'hi';
  return 'en';
}

function isMarker(surface: string, markers: readonly string[]): boolean {
  return markers.includes(surface);
}

/**
 * Sentence signals: a "?" (kept from the raw input since punctuation is stripped
 * in tokens) or a WH-word makes it a question; a negation cue makes it negative.
 * ISL expresses both mostly through non-manual markers, which the NMM pass applies.
 */
export function detectSignals(rawInput: string, tokens: readonly Token[]): SentenceSignals {
  const trimmed = rawInput.trim();
  const questionPunct = trimmed.includes('?') || trimmed.includes('؟');
  const isQuestion =
    questionPunct || tokens.some((t) => isMarker(t.surface, QUESTION_MARKERS));
  const hasNegation = tokens.some((t) => isMarker(t.surface, NEGATION_MARKERS));
  return { isQuestion, hasNegation };
}
