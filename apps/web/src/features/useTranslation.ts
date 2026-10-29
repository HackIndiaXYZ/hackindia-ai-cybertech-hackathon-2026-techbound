// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  TranslationService,
  type DetectedLanguage,
  type TranslationResult,
} from '../lib/translation/index.js';

/**
 * React seam over the pure {@link TranslationService} (plan Â§16 Phase 3A). It owns
 * the input box text and exposes a synchronous `translate()` that produces the
 * shared `IslIntermediateRepresentation` plus measured metrics. The service itself
 * has no side effects and takes an injectable clock, so this hook is trivially
 * testable and the page stays thin.
 *
 * Honesty: translation is a curated rule-based glossary prototype â€” the returned
 * `lowConfidence` flag and `unsupportedConcepts` are surfaced verbatim, never
 * smoothed over.
 */
export interface UseTranslationArgs {
  /** Optional session id stamped onto the representation. */
  sessionId?: string;
  /** Force a language; otherwise auto-detected per call. */
  language?: DetectedLanguage;
  /** Injectable clock for deterministic latency (mainly for tests). */
  clock?: () => number;
  /** Injectable ISO timestamp for the representation's generatedAt. */
  now?: () => string;
}

export interface TranslationApi {
  text: string;
  setText: (value: string) => void;
  result: TranslationResult | null;
  error: string | null;
  /** Translate the current (or given) text; returns the result for immediate use. */
  translate: (input?: string) => TranslationResult | null;
  clear: () => void;
}

export function useTranslation(args: UseTranslationArgs = {}): TranslationApi {
  const { sessionId, language, clock, now } = args;

  const service = useMemo(
    () => new TranslationService({ clock, now }),
    [clock, now],
  );

  const [text, setText] = useState('');
  const textRef = useRef(text);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateText = useCallback((value: string): void => {
    textRef.current = value;
    setText(value);
  }, []);

  const translate = useCallback(
    (input?: string): TranslationResult | null => {
      const source = (input ?? textRef.current).trim();
      if (!source) {
        setError('Enter or dictate a phrase to translate first.');
        return null;
      }
      try {
        const next = service.translate(source, { sessionId, language });
        setResult(next);
        setError(null);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Translation failed unexpectedly.');
        return null;
      }
    },
    [service, sessionId, language],
  );

  const clear = useCallback((): void => {
    updateText('');
    setResult(null);
    setError(null);
  }, [updateText]);

  return { text, setText: updateText, result, error, translate, clear };
}
