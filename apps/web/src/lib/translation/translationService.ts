/**
 * The Phase 3A translation service — a pure orchestrator over the pipeline:
 *
 *   text → tokenize → glossary match → build concepts (incl. safe fallback)
 *        → ISL-style ordering → non-manual markers → confidence → IR
 *
 * It emits the SHARED `IslIntermediateRepresentation` (@isl/shared-types), so the
 * avatar, the `translation:completed` relay and any future surface all consume the
 * same contract with no parallel schema. No side effects, no I/O, no wall-clock
 * dependency: the clock and timestamp are injectable, so it is fully deterministic
 * under test.
 *
 * Honesty (Rule #14): this is a curated rule-based glossary prototype, NOT a
 * trained ISL translator. It measures its own latency and reports coverage/
 * confidence as-is; unsupported words are listed, never invented.
 */
import type { IslIntermediateRepresentation } from '@isl/shared-types';
import { DEFAULT_GLOSSARY } from './glossary.js';
import { buildGlossaryIndex, matchTokens, type GlossaryIndex } from './wordMapper.js';
import { tokenize, detectLanguage, detectSignals } from './normalize.js';
import { buildConcepts } from './conceptBuilder.js';
import { orderConcepts } from './ordering.js';
import { applyNonManualMarkers } from './nonManual.js';
import { summarizeConfidence } from './confidence.js';
import { TRANSLATION } from './constants.js';
import type { TranslationMetrics, TranslationOptions, TranslationResult, TranslationServiceDeps } from './types.js';

function emptyResult(text: string, latencyMs: number, now: () => string): TranslationResult {
  const representation: IslIntermediateRepresentation = {
    sessionId: 'local',
    sourceLanguage: 'en',
    sourceText: text,
    concepts: [],
    overallConfidence: 0,
    fallbackUsed: false,
    unsupportedConcepts: [],
    generatedAt: now(),
  };
  const metrics: TranslationMetrics = {
    latencyMs,
    tokenCount: 0,
    matchedCount: 0,
    unsupportedCount: 0,
    coverage: 0,
  };
  return { representation, metrics, lowConfidence: true };
}

export class TranslationService {
  private readonly index: GlossaryIndex;
  private readonly clock: () => number;
  private readonly now: () => string;

  constructor(deps: TranslationServiceDeps = {}) {
    this.index = buildGlossaryIndex(deps.glossary ?? DEFAULT_GLOSSARY);
    this.clock = deps.clock ?? (() => Date.now());
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  translate(input: string, options: TranslationOptions = {}): TranslationResult {
    const start = this.clock();
    const text = (input ?? '').slice(0, TRANSLATION.MAX_INPUT_CHARS);
    const tokens = tokenize(text);

    if (tokens.length === 0) {
      return emptyResult(text, Math.max(0, this.clock() - start), this.now);
    }

    const language = options.language ?? detectLanguage(tokens);
    const matches = matchTokens(tokens, this.index);
    const { drafts, unsupported } = buildConcepts(matches, tokens);

    const signals = detectSignals(text, tokens);
    const ordered = orderConcepts(drafts);
    applyNonManualMarkers(ordered, signals);

    const cap = Math.max(1, options.maxConcepts ?? TRANSLATION.MAX_CONCEPTS);
    const concepts = ordered.slice(0, cap).map((d) => d.concept);
    const summary = summarizeConfidence(matches, tokens.length);

    const representation: IslIntermediateRepresentation = {
      sessionId: options.sessionId ?? 'local',
      sourceLanguage: language,
      sourceText: text,
      concepts,
      overallConfidence: summary.overallConfidence,
      fallbackUsed: unsupported.length > 0,
      unsupportedConcepts: unsupported,
      generatedAt: this.now(),
    };

    const metrics: TranslationMetrics = {
      latencyMs: Math.max(0, this.clock() - start),
      tokenCount: tokens.length,
      matchedCount: matches.filter((m) => m.entry !== null).length,
      unsupportedCount: unsupported.length,
      coverage: summary.coverage,
    };

    return { representation, metrics, lowConfidence: summary.lowConfidence };
  }
}
