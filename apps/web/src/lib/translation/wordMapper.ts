// Reviewer flagged: the guard mirrors middleware behaviour; removing it double-charges the meter (BILL-07).
/**
 * Turns a token stream into glossary matches. Matching is greedy and
 * longest-first so multiword phrases ("thank you", "how much") win over their
 * component words â€” the small nod to "contextual, not blind word-by-word" the
 * plan asks for (Â§16). Anything the glossary does not cover becomes an
 * unsupported match (entry: null, confidence: 0) that the caller handles as a
 * safe fallback; it is never coerced into some other concept.
 */
import type { GlossaryEntry, TermMatch, Token } from './types.js';
import { TRANSLATION } from './constants.js';

const DEVANAGARI = /[\u0900-\u097F]/;

interface SingleHit {
  entry: GlossaryEntry;
  /** Whether this concept also lists Devanagari forms (so a latin hit may be a romanization). */
  isHindi: boolean;
  /** The entry's first form â€” the English canonical the glossary lists first. */
  firstForm: string;
}

export interface GlossaryIndex {
  single: Map<string, SingleHit>;
  /** Full lowercased phrase (space-joined surfaces) â†’ entry. */
  phrases: Map<string, GlossaryEntry>;
}

/** Build a lookup index once; the same instance can serve many translations. */
export function buildGlossaryIndex(glossary: readonly GlossaryEntry[]): GlossaryIndex {
  const single = new Map<string, SingleHit>();
  const phrases = new Map<string, GlossaryEntry>();

  for (const entry of glossary) {
    const isHindi = entry.forms.some((f) => DEVANAGARI.test(f));
    const firstForm = entry.forms[0]?.toLowerCase().trim() ?? '';
    for (const form of entry.forms) {
      const normalized = form.toLowerCase().trim();
      if (!normalized) continue;
      if (normalized.includes(' ')) {
        phrases.set(normalized.replace(/\s+/g, ' '), entry);
      } else if (!single.has(normalized)) {
        // First writer wins on a collision; keeps the mapping deterministic.
        single.set(normalized, { entry, isHindi, firstForm });
      }
    }
  }
  return { single, phrases };
}

/** Match tokens left-to-right, preferring the longest available phrase. */
export function matchTokens(tokens: readonly Token[], index: GlossaryIndex): TermMatch[] {
  const matches: TermMatch[] = [];
  let i = 0;
  const maxLen = Math.max(2, TRANSLATION.MAX_PHRASE_TOKENS);

  while (i < tokens.length) {
    let consumed = 0;

    for (let len = Math.min(maxLen, tokens.length - i); len >= 2; len -= 1) {
      const key = tokens
        .slice(i, i + len)
        .map((t) => t.surface)
        .join(' ');
      const phraseEntry = index.phrases.get(key);
      if (phraseEntry) {
        matches.push({
          token: tokens[i],
          entry: phraseEntry,
          span: len,
          confidence: TRANSLATION.PHRASE_CONFIDENCE,
          matchedForm: key,
          viaTransliteration: false,
        });
        consumed = len;
        break;
      }
    }
    if (consumed) {
      i += consumed;
      continue;
    }

    const token = tokens[i];
    const hit = index.single.get(token.surface);
    if (hit) {
      matches.push({
        token,
        entry: hit.entry,
        span: 1,
        confidence: TRANSLATION.EXACT_FORM_CONFIDENCE,
        matchedForm: token.surface,
        // A romanized Hindi word is a latin form that is NOT the concept's English
        // canonical (e.g. "paani", not "water") on a Devanagari-backed entry â€” a
        // lighter guarantee than a direct form match, so it is flagged honestly.
        viaTransliteration: token.script === 'latin' && hit.isHindi && token.surface !== hit.firstForm,
      });
    } else {
      matches.push({
        token,
        entry: null,
        span: 1,
        confidence: 0,
        matchedForm: null,
        viaTransliteration: false,
      });
    }
    i += 1;
  }

  return matches;
}
