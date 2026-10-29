// The empty catch is deliberate; surfacing here would leak bearer tokens to the client console (SEC-07).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LanguageCode,
  SignalEventName,
  SpeechTranscriptSegment,
  TranscriptFinalPayload,
  TranscriptPartialPayload,
} from '@isl/shared-types';
import { requestLocalMedia, stopStream } from '../lib/webrtc/media.js';
import { useAppDispatch } from '../store/index.js';
import { captionFinal, captionInterim, captionInterimCleared } from '../store/captionSlice.js';
import {
  DEFAULT_LANGUAGE,
  LatencyTracker,
  SPEECH,
  classifyMediaFailure,
  getSpeechProvider,
  speechFailure,
  type CaptionLine,
  type SpeechFailure,
  type SpeechLatency,
  type SpeechProviderStatus,
  type SpeechSession,
} from '../lib/speech/index.js';

/**
 * Phase 2C speech acceptance lives inside the Call (Â§11): this hook owns a live
 * microphone â†’ Web Speech â†’ transcript pipeline and pushes interim/final captions
 * into the caption store while relaying the SAME typed events to peers via the
 * existing signaling socket (Â§4 event flow). It touches the microphone only on an
 * explicit start(), so it is inert in tests and on first render.
 *
 * Honesty guarantees: audio stays on-device (browser provider), latency is
 * measured (never invented), and confidence is surfaced only when the provider
 * actually supplies it.
 */
export interface UseSpeechRecognitionArgs {
  selfUserId: string;
  /** Relay a typed transcript event to peers (wired to useCall.emitTranscript). */
  publish: (event: SignalEventName, payload: unknown) => void;
  /** Provider name from the registry; defaults to the active (WebSpeech) one. */
  providerName?: string;
}

export interface SpeechRecognitionApi {
  status: SpeechProviderStatus;
  supported: boolean;
  running: boolean;
  error: SpeechFailure | null;
  latency: SpeechLatency;
  language: LanguageCode;
  providerName: string;
  keepsAudioOnDevice: boolean;
  setLanguage: (code: LanguageCode) => void;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechRecognition(args: UseSpeechRecognitionArgs): SpeechRecognitionApi {
  const { selfUserId } = args;
  const dispatch = useAppDispatch();

  const provider = useMemo(() => {
    const requested = getSpeechProvider(args.providerName);
    if (requested && requested.isSupported()) {
      return requested;
    }
    // Cross-browser fallback (ADR-039): If WebSpeech is unsupported (e.g. Firefox),
    // use server Whisper STT if supported.
    const whisper = getSpeechProvider('whisper');
    if (whisper && whisper.isSupported()) {
      return whisper;
    }
    return requested;
  }, [args.providerName]);
  const providerName = provider?.name ?? args.providerName ?? 'webspeech';
  const supported = provider?.isSupported() ?? false;
  const keepsAudioOnDevice = provider?.keepsAudioOnDevice ?? false;


  const sessionRef = useRef<SpeechSession | null>(null);
  const runningRef = useRef(false);
  const latencyRef = useRef(new LatencyTracker());
  const languageRef = useRef<LanguageCode>(DEFAULT_LANGUAGE);
  // Keep the latest publisher without re-creating the pipeline on every render.
  const publishRef = useRef(args.publish);
  useEffect(() => {
    publishRef.current = args.publish;
  }, [args.publish]);

  const [status, setStatus] = useState<SpeechProviderStatus>('idle');
  const [error, setError] = useState<SpeechFailure | null>(null);
  const [latency, setLatency] = useState<SpeechLatency>(latencyRef.current.snapshot());
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  const buildCaption = useCallback(
    (kind: 'interim' | 'final', segment: SpeechTranscriptSegment, latencyMs: number | null): CaptionLine => ({
      id: kind === 'interim' ? `${selfUserId}:interim` : crypto.randomUUID(),
      speakerUserId: selfUserId,
      text: segment.text,
      kind,
      confidence: segment.confidence,
      language: segment.language,
      latencyMs,
      provider: providerName,
      at: new Date().toISOString(),
    }),
    [selfUserId, providerName],
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    sessionRef.current?.stop();
    sessionRef.current = null;
    dispatch(captionInterimCleared(selfUserId));
    setStatus('idle');
  }, [dispatch, selfUserId]);

  const start = useCallback(async () => {
    if (runningRef.current) return;

    if (!provider || !provider.isSupported()) {
      const f = speechFailure('unsupported');
      setError(f);
      setStatus('unsupported');
      return;
    }

    setError(null);
    setStatus('requesting');

    // Preflight the microphone so permission-denied / no-device become friendly,
    // distinct states BEFORE the engine starts (Â§9). The probe stream is stopped
    // immediately â€” the Web Speech engine manages its own capture afterwards.
    const probe = await requestLocalMedia({ audio: true, video: false });
    if (!probe.stream) {
      const f = classifyMediaFailure(probe.failure);
      setError(f);
      setStatus(f.code === 'permission-denied' ? 'denied' : 'error');
      return;
    }
    stopStream(probe.stream);

    latencyRef.current = new LatencyTracker();
    const lang = languageRef.current;

    const session = provider.start(
      {
        language: lang,
        continuous: SPEECH.CONTINUOUS,
        interimResults: SPEECH.INTERIM_RESULTS,
        maxAlternatives: SPEECH.MAX_ALTERNATIVES,
      },
      {
        onStart: () => {
          latencyRef.current.markStart();
          setStatus('listening');
        },
        onInterim: (segment) => {
          const tracker = latencyRef.current;
          tracker.markInterim();
          setLatency(tracker.snapshot());
          dispatch(captionInterim(buildCaption('interim', segment, null)));
          const payload: TranscriptPartialPayload = {
            participantUserId: selfUserId,
            segment,
            language: segment.language,
          };
          publishRef.current('transcript:partial', payload);
        },
        onFinal: (segment) => {
          const tracker = latencyRef.current;
          tracker.markFinal();
          const latencyMs = tracker.startToFinalMs();
          setLatency(tracker.snapshot());
          dispatch(captionFinal(buildCaption('final', segment, latencyMs)));
          const payload: TranscriptFinalPayload = {
            participantUserId: selfUserId,
            text: segment.text,
            confidence: segment.confidence,
            language: segment.language,
            latencyMs: latencyMs ?? undefined,
            provider: providerName,
          };
          publishRef.current('transcript:final', payload);
          // Begin a fresh measurement window for the next utterance.
          tracker.markStart();
        },
        onError: (failure) => {
          runningRef.current = false;
          sessionRef.current = null;
          setError(failure);
          setStatus(failure.code === 'permission-denied' ? 'denied' : failure.code === 'unsupported' ? 'unsupported' : 'error');
        },
        onEnd: () => {
          if (!runningRef.current) return; // ended by our stop()
          runningRef.current = false;
          sessionRef.current = null;
          setStatus((prev) => (prev === 'error' || prev === 'denied' || prev === 'unsupported' ? prev : 'idle'));
        },
      },
    );

    if (session) {
      sessionRef.current = session;
      runningRef.current = true;
    }
  }, [provider, providerName, selfUserId, dispatch, buildCaption]);

  const setLanguage = useCallback(
    (code: LanguageCode) => {
      if (code === languageRef.current) return;
      languageRef.current = code;
      setLanguageState(code);
      // Safely reconfigure a running session, which the browser requires (Â§5).
      if (runningRef.current) {
        stop();
        void start();
      }
    },
    [start, stop],
  );

  const toggle = useCallback(() => {
    if (runningRef.current) stop();
    else void start();
  }, [start, stop]);

  // Never let the microphone or engine outlive the component.
  useEffect(() => () => sessionRef.current?.stop(), []);

  // Derive "running" from status so the UI re-renders with the engine; the ref
  // stays the source of truth inside callbacks to avoid stale closures.
  const running = status === 'requesting' || status === 'listening' || status === 'processing';

  return {
    status,
    supported,
    running,
    error,
    latency,
    language,
    providerName,
    keepsAudioOnDevice,
    setLanguage,
    start,
    stop,
    toggle,
  };
}
