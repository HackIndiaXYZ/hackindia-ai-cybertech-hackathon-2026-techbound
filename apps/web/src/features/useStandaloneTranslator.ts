import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { addEntry, clearHistory } from '../store/standaloneHistorySlice.js';
import {
  StandaloneMachine,
  buildHistoryEntry,
  STATUS_META,
  type HistoryEntry,
  type InputMode,
  type StandaloneState,
  type StatusMeta,
} from '../lib/standalone/index.js';
import { TranslationService, type TranslationResult } from '../lib/translation/index.js';
import { api } from '../lib/apiClient.js';
import { SessionRecorder, fetchConsentState } from '../lib/sessionRecord.js';
import type { CreateSessionResponse, LanguageCode } from '@isl/shared-types';
import { useLiveDictation, type DictationFinalMeta } from './useLiveDictation.js';
import { useAvatar, type AvatarApi } from './useAvatar.js';

/**
 * Orchestrates the Phase 3C standalone translator (§18) WITHOUT introducing any new
 * engine. It simply wires three existing seams together behind the clean
 * {@link StandaloneMachine}:
 *
 *   dictation (2C) ─┐
 *   typed text     ─┴─▶ TranslationService (3A) ─▶ avatar.enqueueConcepts (2D)
 *
 * There is deliberately no peer-to-peer / call involvement: the whole flow runs
 * locally (mic audio is never uploaded, translation happens in-browser, the
 * avatar renders locally). The one exception is consented persistence (Phase
 * 4A): when the account's `recording` scope is granted, finished transcript text
 * and translation rows are stored on the server for the History screen — never
 * audio, and never without the server-side consent check agreeing.
 * Every confidence number surfaced here is measured by the
 * underlying seam — transcript confidence is `null` when the provider does not
 * report it, and translation confidence is the rule-based glossary's own value.
 *
 * Honesty carried through: the pipeline is the curated rule-based prototype feeding
 * placeholder avatar motions; `result.lowConfidence` and the avatar's
 * `rig.isPlaceholder` are exposed verbatim so the page can badge them.
 */
export interface UseStandaloneTranslatorArgs {
  /** Optional dictation provider override (defaults to the browser engine). */
  providerName?: string;
  /** Start in public-space/event mode (large text, minimal chrome). */
  initialEventMode?: boolean;
}

export interface StandaloneTranslatorApi {
  state: StandaloneState;
  status: StatusMeta;
  inputMode: InputMode;
  eventMode: boolean;
  dictationSupported: boolean;
  keepsAudioOnDevice: boolean;
  providerName: string;
  language: ReturnType<typeof useLiveDictation>['language'];
  liveText: string;
  typedText: string;
  transcriptConfidence: number | null;
  result: TranslationResult | null;
  errorText: string | null;
  avatar: AvatarApi;
  history: readonly HistoryEntry[];
  /** True once consented artefacts from this run have been accepted by the writer. */
  persisting: boolean;
  chooseInputMode: (mode: InputMode) => void;
  setEventMode: (on: boolean) => void;
  setTypedText: (value: string) => void;
  setLanguage: ReturnType<typeof useLiveDictation>['setLanguage'];
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  translateTyped: () => void;
  clearResult: () => void;
  clearHistory: () => void;
}

export function useStandaloneTranslator(args: UseStandaloneTranslatorArgs = {}): StandaloneTranslatorApi {
  const dispatch = useAppDispatch();
  const history = useAppSelector((s) => s.standaloneHistory.entries);

  const machine = useMemo(() => new StandaloneMachine(), []);
  const service = useMemo(() => new TranslationService(), []);
  const avatar = useAvatar();

  const [state, setState] = useState<StandaloneState>(machine.getState());
  const [inputMode, setInputMode] = useState<InputMode>('speak');
  const [eventMode, setEventMode] = useState(args.initialEventMode ?? false);
  const [liveText, setLiveText] = useState('');
  const [typedText, setTypedText] = useState('');
  const [transcriptConfidence, setTranscriptConfidence] = useState<number | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [persisting, setPersisting] = useState(false);

  /**
   * Consent-gated history writer (Phase 4A). Resolved lazily on the first
   * finished pipeline run: read our consent state; only when `recording` is
   * granted do we open a server-side `translator` session to attach rows to.
   * Any failure (offline, unauthenticated, consent off) resolves to null and
   * the flow stays purely local — no retries, no noise, nothing stored.
   */
  const recorderPromiseRef = useRef<Promise<SessionRecorder | null> | null>(null);
  const getRecorder = useCallback((): Promise<SessionRecorder | null> => {
    if (!recorderPromiseRef.current) {
      recorderPromiseRef.current = (async () => {
        const consent = await fetchConsentState();
        if (!consent.recording) return null;
        const created = await api.post<CreateSessionResponse>('/sessions', { type: 'translator' });
        return new SessionRecorder({ sessionId: created.session.id });
      })().catch(() => null);
    }
    return recorderPromiseRef.current;
  }, []);

  useEffect(() => machine.subscribe(setState), [machine]);

  /**
   * Render tracking. We stay in 'rendering' until the avatar queue actually drains
   * (so the state is truthful), but fall back to completing immediately when nothing
   * was accepted (all gestures unrecognized / zero concepts) so the loop never hangs.
   */
  const renderRef = useRef({ active: false, seenActive: false, toIdle: false });

  const completeRender = useCallback((): void => {
    const r = renderRef.current;
    r.active = false;
    r.seenActive = false;
    const toIdle = r.toIdle;
    r.toIdle = false;
    machine.dispatch({ type: 'RENDERED' });
    if (toIdle) machine.dispatch({ type: 'STOP' });
  }, [machine]);

  useEffect(() => {
    const r = renderRef.current;
    if (!r.active || machine.getState() !== 'rendering') return;
    const q = avatar.queue;
    if (q.state !== 'idle' || q.length > 0 || q.current !== null) {
      r.seenActive = true;
      return;
    }
    if (r.seenActive) completeRender();
  }, [avatar.queue, completeRender]);

  /** The single translate → render → history path shared by speak and type modes. */
  const runPipeline = useCallback(
    (text: string, mode: InputMode, confidence: number | null, language: LanguageCode): void => {
      const trimmed = text.trim();

      // Bring the machine into 'translating' from wherever it legitimately is.
      const s = machine.getState();
      if (s === 'idle' || s === 'error') machine.dispatch({ type: 'START' });
      if (s === 'paused') machine.dispatch({ type: 'RESUME' });
      if (machine.getState() === 'listening') machine.dispatch({ type: 'INTERIM' });
      machine.dispatch({ type: 'FINAL' });

      if (!trimmed) {
        setErrorText('Nothing to translate yet.');
        machine.dispatch({ type: 'ERROR' });
        return;
      }

      let translated: TranslationResult | null = null;
      try {
        translated = service.translate(trimmed);
      } catch {
        translated = null;
      }
      if (!translated) {
        setErrorText('Translation failed.');
        machine.dispatch({ type: 'ERROR' });
        return;
      }

      setErrorText(null);
      setResult(translated);
      const representation = translated.representation;
      dispatch(
        addEntry(
          buildHistoryEntry(translated, {
            input: trimmed,
            mode,
            transcriptConfidence: confidence,
          }),
        ),
      );

      // Consent-gated server persistence (Phase 4A): transcript *text* and the
      // translation row — never audio. Resolves to a no-op when consent is
      // absent or the server is unreachable; the UI badge reflects the truth.
      void getRecorder().then((recorder) => {
        if (!recorder) return;
        setPersisting(true);
        recorder.recordTranscript(
          { text: trimmed, confidence, language, source: mode === 'speak' ? 'speech' : 'text' },
        );
        recorder.recordTranslation({ sourceTranscriptId: crypto.randomUUID(), representation });
      });

      const play = avatar.enqueueConcepts(translated.representation.concepts);
      machine.dispatch({ type: 'TRANSLATED' }); // → rendering

      if (play.accepted > 0) {
        renderRef.current = { active: true, seenActive: false, toIdle: mode === 'type' };
      } else {
        // Nothing will animate (0 concepts or all-unrecognized): finish now.
        renderRef.current.toIdle = mode === 'type';
        completeRender();
      }
    },
    [machine, service, dispatch, avatar, completeRender, getRecorder],
  );

  const dictation = useLiveDictation({
    providerName: args.providerName,
    onInterim: (text) => {
      setLiveText(text);
      if (machine.getState() === 'listening') machine.dispatch({ type: 'INTERIM' });
    },
    onFinal: (text, meta: DictationFinalMeta) => {
      setLiveText(text);
      setTranscriptConfidence(meta.confidence);
      runPipeline(text, 'speak', meta.confidence, meta.language);
    },
  });

  // Surface a dictation failure through the same error state (never swallow it).
  useEffect(() => {
    if (dictation.error) {
      setErrorText(dictation.error.message);
      machine.dispatch({ type: 'ERROR' });
    }
  }, [dictation.error, machine]);

  const start = useCallback((): void => {
    machine.dispatch({ type: 'START' });
    if (inputMode === 'speak') void dictation.start();
  }, [machine, inputMode, dictation]);

  const pause = useCallback((): void => {
    if (!machine.dispatch({ type: 'PAUSE' })) return;
    if (inputMode === 'speak') dictation.stop();
  }, [machine, inputMode, dictation]);

  const resume = useCallback((): void => {
    machine.dispatch({ type: 'RESUME' });
    if (inputMode === 'speak') void dictation.start();
  }, [machine, inputMode, dictation]);

  const stop = useCallback((): void => {
    machine.dispatch({ type: 'STOP' });
    if (inputMode === 'speak') dictation.stop();
  }, [machine, inputMode, dictation]);

  const chooseInputMode = useCallback(
    (mode: InputMode): void => {
      if (mode === inputMode) return;
      setInputMode(mode);
      // Leaving speak mode must not leave the mic running.
      if (inputMode === 'speak') dictation.stop();
      machine.dispatch({ type: 'STOP' });
      setErrorText(null);
    },
    [inputMode, dictation, machine],
  );

  const translateTyped = useCallback((): void => {
    setLiveText(typedText);
    setTranscriptConfidence(null);
    runPipeline(typedText, 'type', null, dictation.language);
  }, [typedText, runPipeline, dictation.language]);

  const clearResult = useCallback((): void => {
    setResult(null);
    setLiveText('');
    setTranscriptConfidence(null);
    setErrorText(null);
  }, []);

  const resetHistory = useCallback((): void => {
    dispatch(clearHistory());
  }, [dispatch]);

  return {
    state,
    status: STATUS_META[state],
    inputMode,
    eventMode,
    dictationSupported: dictation.supported,
    keepsAudioOnDevice: dictation.keepsAudioOnDevice,
    providerName: dictation.providerName,
    language: dictation.language,
    liveText,
    typedText,
    transcriptConfidence,
    result,
    errorText,
    avatar,
    history,
    persisting,
    chooseInputMode,
    setEventMode,
    setTypedText,
    setLanguage: dictation.setLanguage,
    start,
    pause,
    resume,
    stop,
    translateTyped,
    clearResult,
    clearHistory: resetHistory,
  };
}
