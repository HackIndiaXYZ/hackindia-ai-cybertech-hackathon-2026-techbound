/** Shared factories for the Phase 3A translation unit tests. */
import type { GlossaryEntry, TermMatch, Token } from './types.js';

export function tok(surface: string, index: number, script: Token['script'] = 'latin'): Token {
  return { raw: surface, surface, script, index };
}

export function makeEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    conceptId: 'x',
    forms: ['x'],
    normalizedMeaning: 'meaning',
    gestureIds: ['wave'],
    role: 'other',
    facialExpression: 'neutral',
    timingMs: 800,
    ...overrides,
  };
}

export function makeMatch(overrides: Partial<TermMatch> = {}): TermMatch {
  return {
    token: tok('a', 0),
    entry: null,
    span: 1,
    confidence: 0,
    matchedForm: null,
    viaTransliteration: false,
    ...overrides,
  };
}
