/**
 * Local contracts for the Phase 3A speech-to-ISL translation engine
 * (VIBECODER_MASTER_PLAN.md §16). The cross-boundary shapes that actually leave
 * this module — `IslConcept`, `IslIntermediateRepresentation`, `FacialExpression`
 * — live in @isl/shared-types and are REUSED, never duplicated. Everything here is
 * browser-internal: the tokenizer, glossary and scoring types that turn a spoken or
 * typed phrase into the shared intermediate representation.
 *
 * Honesty (Rule #14): this is a CURATED RULE-BASED glossary prototype, not a
 * trained translator. There is no ISL ML model or dictionary dataset in this repo,
 * so nothing here may be presented as professional ISL translation. Concept
 * confidence is computed from glossary coverage and reported as-is; unsupported
 * words fall back safely (they are listed, never silently invented as a sign).
 */
import type { FacialExpression, IslConcept, IslIntermediateRepresentation } from '@isl/shared-types';

/** Script a token was written in, used for language detection. */
export type TokenScript = 'latin' | 'devanagari' | 'other';

/** A normalized surface form plus enough fidelity to echo it back honestly. */
export interface Token {
  /** Original text as it appeared (source fidelity). */
  raw: string;
  /** Lowercased, punctuation-stripped lookup key. */
  surface: string;
  script: TokenScript;
  /** Position within the token stream. */
  index: number;
}

/**
 * The grammatical/semantic role a concept plays. Ordering + non-manual-marker
 * passes key off this, so it is intentionally coarse and heuristic — it is NOT a
 * claim of real ISL grammar parsing.
 */
export type ConceptRole =
  | 'pronoun'
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'feeling'
  | 'time'
  | 'place'
  | 'question'
  | 'negation'
  | 'politeness'
  | 'connector'
  | 'other';

/** One curated glossary concept and every surface form that maps to it. */
export interface GlossaryEntry {
  conceptId: string;
  /** Lowercased surface forms: English words, romanized Hindi and Devanagari. */
  forms: readonly string[];
  /** Plain-language meaning shown in the IR (never an ISL "translation"). */
  normalizedMeaning: string;
  /**
   * Development gesture ids used to exercise the avatar pipeline. They MUST be
   * present in the 2D placeholder registry or the avatar reports them as
   * unrecognized — they carry NO ISL meaning and are placeholders only (§10).
   */
  gestureIds: readonly string[];
  role: ConceptRole;
  /** Default facial expression for this concept before sentence-level NMM. */
  facialExpression: FacialExpression;
  /** Typical dwell for one showing of this concept. */
  timingMs: number;
}

/** The result of matching a span of one or more tokens against the glossary. */
export interface TermMatch {
  token: Token;
  /** The matched glossary entry, or null when nothing covered this token. */
  entry: GlossaryEntry | null;
  /** Number of consecutive tokens consumed (>1 for multiword phrases). */
  span: number;
  /** 0..1. How strongly the surface matched; 0 for unsupported tokens. */
  confidence: number;
  /** The exact glossary form that matched (for debugging / honest display). */
  matchedForm: string | null;
  /** True when a Devanagari form was reached through its romanization. */
  viaTransliteration: boolean;
}

/** Sentence-level signals the non-manual-marker + ordering passes consume. */
export interface SentenceSignals {
  isQuestion: boolean;
  hasNegation: boolean;
}

/**
 * A concept plus the role metadata the ordering + non-manual-marker passes need.
 * `IslConcept` has no role field, so the role is carried alongside it internally
 * and stripped before the representation is emitted.
 */
export interface DraftConcept {
  concept: IslConcept;
  role: ConceptRole;
  /** True for a glossary question word (drives question NMM + late ordering). */
  isQuestionWord: boolean;
  /** True for a fallback (unmatched) concept. */
  isFallback: boolean;
}

/** Measured, never invented, translation metrics. */
export interface TranslationMetrics {
  /** Wall-clock translate() duration, measured via the injected clock. */
  latencyMs: number;
  tokenCount: number;
  matchedCount: number;
  unsupportedCount: number;
  /** matchedCount / tokenCount, 0 when there were no tokens. */
  coverage: number;
}

export interface TranslationResult {
  representation: IslIntermediateRepresentation;
  metrics: TranslationMetrics;
  /** True when overall confidence or coverage is too low to be trustworthy. */
  lowConfidence: boolean;
}

/** Auto-detected source language for display; keeps the shared LanguageCode idea. */
export type DetectedLanguage = 'en' | 'hi' | 'hi-en';

export interface TranslationOptions {
  sessionId?: string;
  /** Force a language; when omitted it is auto-detected from the scripts present. */
  language?: DetectedLanguage;
  /** Injectable monotonic-ish clock for deterministic latency in tests. */
  clock?: () => number;
  /** Injectable ISO timestamp for the IR's generatedAt (deterministic tests). */
  now?: () => string;
  /** Hard cap on emitted concepts to bound a pathological input. */
  maxConcepts?: number;
}

export interface TranslationServiceDeps {
  glossary?: readonly GlossaryEntry[];
  clock?: () => number;
  now?: () => string;
}
