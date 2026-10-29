/**
 * Honest confidence + coverage aggregation (plan §16 "low confidence visible",
 * "unsupported words handled"). Overall confidence is a span-weighted mean of the
 * per-match confidences divided by TOTAL tokens, so unsupported words and thin
 * coverage genuinely pull the number down rather than being hidden. Nothing here
 * pretends to know a real model probability — it is glossary coverage, plainly.
 */
import type { TermMatch } from './types.js';
import { TRANSLATION } from './constants.js';
import { round2 } from './util.js';

export interface ConfidenceSummary {
  /** 0..1 span-weighted overall confidence. */
  overallConfidence: number;
  /** 0..1 fraction of tokens the glossary covered at all. */
  coverage: number;
  /** True when confidence or coverage is too low to present without a warning. */
  lowConfidence: boolean;
}

export function summarizeConfidence(matches: readonly TermMatch[], tokenCount: number): ConfidenceSummary {
  if (tokenCount <= 0) {
    return { overallConfidence: 0, coverage: 0, lowConfidence: true };
  }

  let coveredTokens = 0;
  let weighted = 0;
  for (const match of matches) {
    const conf = match.entry ? match.confidence : TRANSLATION.FALLBACK_CONFIDENCE;
    weighted += conf * match.span;
    if (match.entry) coveredTokens += match.span;
  }

  const overallConfidence = round2(Math.min(1, weighted / tokenCount));
  const coverage = round2(coveredTokens / tokenCount);
  const lowConfidence =
    overallConfidence < TRANSLATION.LOW_CONFIDENCE_THRESHOLD ||
    coverage < TRANSLATION.MIN_USEFUL_COVERAGE;

  return { overallConfidence, coverage, lowConfidence };
}
