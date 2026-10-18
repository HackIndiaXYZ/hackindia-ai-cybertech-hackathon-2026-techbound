/**
 * Builds draft concepts from glossary matches. Matched spans become real
 * concepts (with the glossary's placeholder gesture ids); unsupported tokens
 * become an explicit fallback concept that carries NO gesture ids — so the avatar
 * simply skips it rather than animating a made-up "sign" (§16 "unsupported words
 * handled safely"). The source word is preserved and surfaced as unsupported.
 */
import type { DraftConcept, TermMatch, Token } from './types.js';
import { TRANSLATION } from './constants.js';
import { clamp, round2 } from './util.js';

function clampTiming(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return TRANSLATION.DEFAULT_TIMING_MS;
  return Math.round(clamp(ms, TRANSLATION.MIN_TIMING_MS, TRANSLATION.MAX_TIMING_MS));
}

/** Join the raw surface of every token a span consumed, for source fidelity. */
function spanText(token: Token, span: number, tokens: readonly Token[]): string {
  return tokens.slice(token.index, token.index + span).map((t) => t.raw).join(' ') || token.raw;
}

export interface BuiltConcepts {
  drafts: DraftConcept[];
  /** Lowercased surfaces the glossary could not cover (never invented). */
  unsupported: string[];
}

export function buildConcepts(matches: readonly TermMatch[], tokens: readonly Token[]): BuiltConcepts {
  const drafts: DraftConcept[] = [];
  const unsupported: string[] = [];

  for (const match of matches) {
    const sourceText = spanText(match.token, match.span, tokens);
    if (match.entry) {
      drafts.push({
        concept: {
          conceptId: match.entry.conceptId,
          sourceText,
          normalizedMeaning: match.entry.normalizedMeaning,
          gestureIds: [...match.entry.gestureIds],
          ordering: 0, // assigned by the ordering pass
          confidence: round2(match.confidence),
          facialExpression: match.entry.facialExpression,
          timingMs: clampTiming(match.entry.timingMs),
        },
        role: match.entry.role,
        isQuestionWord: match.entry.role === 'question',
        isFallback: false,
      });
    } else {
      // Safe fallback: present in the IR + surfaced with fingerspelling fallback for unrecognized alphabetic words
      unsupported.push(match.token.surface);
      const isAlphabetic = /^[a-z]+$/i.test(match.token.surface);

      drafts.push({
        concept: {
          conceptId: 'unknown',
          sourceText,
          normalizedMeaning: match.token.surface,
          gestureIds: [],
          ordering: 0,
          confidence: round2(TRANSLATION.FALLBACK_CONFIDENCE),
          facialExpression: 'neutral',
          timingMs: TRANSLATION.DEFAULT_TIMING_MS,
          fallbackBehavior: isAlphabetic
            ? `fingerspell: ${match.token.surface}`
            : `unrecognized term: "${match.token.surface}"`,
        },
        role: 'other',
        isQuestionWord: false,
        isFallback: true,
      });
    }
  }

  return { drafts, unsupported };
}
