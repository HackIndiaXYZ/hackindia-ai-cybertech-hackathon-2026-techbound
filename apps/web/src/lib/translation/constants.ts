/**
 * Tunables for the translation module. Kept in one place so the pipeline's
 * behavior is adjustable and testable without hunting through logic.
 * Nothing here asserts an accuracy claim — these are operating defaults for a
 * curated rule-based glossary (§16), not a trained translator.
 */

export const TRANSLATION = Object.freeze({
  /** Cap input length so a pathological transcript cannot wedge the pipeline. */
  MAX_INPUT_CHARS: 4000,
  /** Cap emitted concepts to bound the avatar queue on a huge input. */
  MAX_CONCEPTS: 64,
  /** Fallback dwell when a glossary entry omits a sane timing. */
  DEFAULT_TIMING_MS: 800,
  MIN_TIMING_MS: 200,
  MAX_TIMING_MS: 6000,
  /** Exact single-form surface match confidence. */
  EXACT_FORM_CONFIDENCE: 0.95,
  /** Multiword phrase match (a little higher: more context, less ambiguity). */
  PHRASE_CONFIDENCE: 0.97,
  /** Devanagari reached through its romanization (lighter guarantee). */
  TRANSLITERATION_CONFIDENCE: 0.82,
  /** Confidence assigned to an unsupported token that fell back. */
  FALLBACK_CONFIDENCE: 0.05,
  /** Overall confidence below this surfaces a visible "low confidence" warning. */
  LOW_CONFIDENCE_THRESHOLD: 0.5,
  /** Glossary coverage below this means the output is mostly fallback — warn. */
  MIN_USEFUL_COVERAGE: 0.34,
  /** Longest phrase (in tokens) the matcher will attempt, from the glossary. */
  MAX_PHRASE_TOKENS: 3,
} as const);

/** Punctuation stripped during normalization (kept permissive for Devanagari). */
export const PUNCTUATION = /[.,!?;:,'"`(){}[\]<>…—–~!?"'|]/g;

/**
 * Sentence-final question cues. ISL marks questions with a non-manual marker
 * (raised eyebrows / head tilt) rather than a word, so a question cue anywhere —
 * a "?" or a WH-word — flags the whole utterance for question NMM (§16).
 */
export const QUESTION_MARKERS = [
  'who',
  'what',
  'where',
  'when',
  'why',
  'how',
  'which',
  'whose',
  'kya',
  'kaun',
  'kab',
  'kahan',
  'kahin',
  'कौन',
  'क्या',
  'कब',
  'कहाँ',
  'कहां',
  'कितना',
  'kyu',
  'kyon',
  'kyuon',
] as const;

/** Negation cues that trigger a negative non-manual marker on the verb. */
export const NEGATION_MARKERS = [
  'not',
  'no',
  'never',
  'nahi',
  'nahin',
  'नहीं',
  'नही',
  'mat',
  'mana',
  'without',
] as const;

/**
 * English function words ISL simply does not sign. Articles and the plain
 * genitive preposition carry no content a Deaf gloss would keep, so they are
 * dropped instead of being spelled letter by letter (fingerspelling a "the" is
 * not a sign, it is noise). They are also not reported as unsupported words,
 * because nothing failed to match — the word is deliberately not signed.
 */
export const UNIGNED_FUNCTION_WORDS = ['the', 'a', 'an', 'of'] as const;
