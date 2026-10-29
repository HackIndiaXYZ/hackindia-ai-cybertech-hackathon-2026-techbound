/**
 * Turns a real Phase 3A `TranslationResult` (+ the 2C transcript confidence) into
 * a reviewable {@link HistoryEntry}. Kept as a pure function with injectable id/
 * clock so the mapping is deterministic and unit-testable, and so no field is
 * invented: every number is read straight from the result the pipeline produced.
 */
import type { TranslationResult } from '../translation/index.js';
import type { HistoryEntry, InputMode } from './types.js';

export interface BuildHistoryArgs {
  input: string;
  mode: InputMode;
  /** Transcript confidence from the dictation provider, or null when unreported. */
  transcriptConfidence: number | null;
  /** Injectable id (defaults to a random uuid when available). */
  id?: string;
  /** Injectable ISO timestamp (defaults to now). */
  at?: string;
}

function makeId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildHistoryEntry(result: TranslationResult, args: BuildHistoryArgs): HistoryEntry {
  const { representation, metrics, lowConfidence } = result;
  return {
    id: args.id ?? makeId(),
    input: args.input.trim(),
    mode: args.mode,
    transcriptConfidence: args.transcriptConfidence,
    overallConfidence: representation.overallConfidence,
    coverage: metrics.coverage,
    conceptCount: representation.concepts.length,
    unsupportedCount: metrics.unsupportedCount,
    latencyMs: metrics.latencyMs,
    lowConfidence,
    at: args.at ?? new Date().toISOString(),
  };
}
