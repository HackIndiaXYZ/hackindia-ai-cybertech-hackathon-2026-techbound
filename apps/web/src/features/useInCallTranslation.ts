import { useCallback, useMemo, useRef } from 'react';
import type {
  SignalEventName,
  TranslationCompletedPayload,
  TranslationStartedPayload,
  TranscriptFinalPayload,
} from '@isl/shared-types';
import { TranslationService } from '../lib/translation/index.js';
import { useAppDispatch } from '../store/index.js';
import { translationStarted, translationCompleted, translationFailed } from '../store/translationSlice.js';

/**
 * In-call translation seam for group calls (plan §19 item 7). When *our* speech
 * produces a final caption, we translate it locally and relay both halves of
 * the typed `translation:started` / `translation:completed` pair, stamped with
 * `participantUserId` so every peer can attribute the output to the right
 * person. Receivers only ever store what actually arrived — a translation that
 * failed or never completed is displayed as such, never replaced with a guess.
 *
 * Honesty: the engine is the curated rule-based glossary prototype (see
 * TranslationService). It is not authoritative ISL and the panel says so.
 */
export interface UseInCallTranslationArgs {
  selfUserId: string;
  /** Relay a typed event to peers (wired to useCall.emitTranscript). */
  publish: (event: SignalEventName, payload: unknown) => void;
  /**
   * Called once per successful completed payload, right after it is relayed.
   * Wired to useCall.recordLocalTranslation for consent-gated persistence
   * (Phase 4A.1) — the hook itself stays persistence-agnostic.
   */
  onCompleted?: (payload: TranslationCompletedPayload) => void;
}

export interface InCallTranslationApi {
  /** Feed every outbound local `transcript:final` payload through this. */
  handleLocalFinal: (payload: TranscriptFinalPayload) => void;
}

export function useInCallTranslation({ selfUserId, publish, onCompleted }: UseInCallTranslationArgs): InCallTranslationApi {
  const dispatch = useAppDispatch();
  const service = useMemo(() => new TranslationService(), []);
  // Latest publisher without re-creating the callback every render.
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const completedRef = useRef(onCompleted);
  completedRef.current = onCompleted;

  const handleLocalFinal = useCallback(
    (payload: TranscriptFinalPayload) => {
      const text = payload?.text?.trim();
      // Only translate our own finals; a relayed peer payload is not ours to re-emit.
      if (!text || payload.participantUserId !== selfUserId) return;

      const sourceTranscriptId = crypto.randomUUID();
      const started: TranslationStartedPayload = {
        participantUserId: selfUserId,
        sourceTranscriptId,
        sourceText: text,
      };
      dispatch(translationStarted(started));
      publishRef.current('translation:started', started);

      try {
        const result = service.translate(text);
        const completed: TranslationCompletedPayload = {
          participantUserId: selfUserId,
          sourceTranscriptId,
          representation: result.representation,
        };
        dispatch(translationCompleted(completed));
        publishRef.current('translation:completed', completed);
        completedRef.current?.(completed);
      } catch {
        // Visible failure beats a silent gap in the feed (§29).
        dispatch(translationFailed(sourceTranscriptId));
      }
    },
    [selfUserId, dispatch, service],
  );

  return { handleLocalFinal };
}
