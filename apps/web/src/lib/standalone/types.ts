// Frozen shape required by the legacy desktop bundle; retire after the 27.02 EOL notice.
/**
 * Local contracts for the Phase 3C standalone translator mode
 * (VIBECODER_MASTER_PLAN.md Â§18). Nothing here introduces a new engine: the
 * standalone page is an orchestration surface that composes the existing seams â€”
 * the Phase 2C dictation provider, the Phase 3A rule-based TranslationService and
 * the Phase 2D avatar controller. These types are the glue: an explicit state
 * machine and a translation-history record.
 *
 * Honesty (Rule #14): the pipeline it drives is a curated rule-based glossary
 * prototype feeding placeholder avatar motions, and the standalone mode never
 * requires a peer-to-peer call. History is kept in memory only (never sent
 * anywhere), and every confidence value surfaced here is the measured value from
 * the underlying seams, reported as-is (possibly null), never fabricated.
 */

/**
 * The clean state machine the prompt asks for (Â§18). One active state at a time;
 * see `stateMachine.ts` for the exact allowed transitions.
 */
export type StandaloneState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'translating'
  | 'rendering'
  | 'error'
  | 'paused';

/**
 * Input modes the user can choose from (Â§18 "choose input mode"). Both feed the
 * same translation â†’ avatar pipeline; only how text is captured differs.
 *  - 'speak' â€” live dictation via the 2C provider (huge live transcript).
 *  - 'type'  â€” manual text entry, for quiet spaces or browsers without speech.
 */
export type InputMode = 'speak' | 'type';

/** Events that drive {@link StandaloneState} transitions. */
export type StandaloneEvent =
  | { type: 'START' }
  | { type: 'INTERIM' }
  | { type: 'FINAL' }
  | { type: 'TRANSLATED' }
  | { type: 'RENDERED' }
  | { type: 'ERROR' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' };

/**
 * One completed translation in the reviewable history (Â§18 "review translation
 * history"). Fields mirror what the 3A result + 2C transcript actually report;
 * transcript confidence may be null when the provider does not emit it.
 */
export interface HistoryEntry {
  id: string;
  /** The spoken/typed source phrase. */
  input: string;
  mode: InputMode;
  /** Provider transcript confidence 0..1, or null when not reported. */
  transcriptConfidence: number | null;
  /** Translation overall confidence 0..1 (from the 3A representation). */
  overallConfidence: number;
  /** Glossary coverage 0..1 (from the 3A metrics). */
  coverage: number;
  conceptCount: number;
  unsupportedCount: number;
  /** Measured translate() latency in ms. */
  latencyMs: number;
  /** True when the 3A result flagged the translation as low-confidence. */
  lowConfidence: boolean;
  /** ISO timestamp of when the entry was recorded. */
  at: string;
}
