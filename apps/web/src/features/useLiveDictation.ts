import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LanguageCode, SpeechTranscriptSegment } from '@isl/shared-types';
import { requestLocalMedia, stopStream } from '../lib/webrtc/media.js';
import {
  DEFAULT_LANGUAGE,
  LatencyTracker,
  SPEECH,
  classifyMediaFailure,
  getSpeechProvider,
  speechFailure,
  type SpeechFailure,
  type SpeechLatency,
  type SpeechProviderStatus,
  type SpeechSession,
} from '../lib/speech/index.js';

/**
 * Optional live-dictation seam for the Phase 3A pipeline demo. It reuses the exact
 * Phase 2C provider boundary (`getSpeechProvider`, the Web Speech engine, the
 * latency tracker and the media preflight) but is deliberately NOT wired to the
 * call/caption store — it simply hands each final transcript up to `onFinal` so the
 * pipeline page can feed it into translation. The microphone is touched only on an
 * explicit `start()`, so this hook is inert in tests and on first render (§9).
 *
 * Honesty: audio stays on-device (browser provider); latency is measured, never
 * invented; confidence is surfaced only when the provider actually supplies it.
 */
export interface DictationFinalMeta {
  confidence: number | null;
  language: LanguageCode;
  latencyMs: number | null;
  provider: string;
}

export interface UseLiveDictationArgs {
  onFinal: (text: string, meta: DictationFinalMeta) => void;
  onInterim?: (text: string) => void;
  providerName?: string;
}

export interface LiveDictationApi {
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

export function useLiveDictation(args: UseLiveDictationArgs): LiveDictationApi {
  const provider = useMemo(() => getSpeechProvider(args.providerName), [args.providerName]);
  const providerName = provider?.name ?? args.providerName ?? 'webspeech';
  const supported = provider?.isSupported() ?? false;
  const keepsAudioOnDevice = provider?.keepsAudioOnDevice ?? false;

  const sessionRef = useRef<SpeechSession | null>(null);
  const runningRef = useRef(false);
  const latencyRef = useRef(new LatencyTracker());
  const languageRef = useRef<LanguageCode>(DEFAULT_LANGUAGE);

  // Keep latest callbacks without re-creating the pipeline each render.
  const onFinalRef = useRef(args.onFinal);
  const onInterimRef = useRef(args.onInterim);
  useEffect(() => {
    onFinalRef.current = args.onFinal;
    onInterimRef.current = args.onInterim;
  }, [args.onFinal, args.onInterim]);

  const [status, setStatus] = useState<SpeechProviderStatus>('idle');
  const [error, setError] = useState<SpeechFailure | null>(null);
  const [latency, setLatency] = useState<SpeechLatency>(latencyRef.current.snapshot());
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  const stop = useCallback((): void => {
    runningRef.current = false;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (runningRef.current) return;
    if (!provider || !provider.isSupported()) {
      const f = speechFailure('unsupported');
      setError(f);
      setStatus('unsupported');
      return;
    }

    setError(null);
    setStatus('requesting');

    // Preflight the mic so permission-denied / no-device are distinct states (§9).
    const probe = await requestLocalMedia({ audio: true, video: false });
    if (!probe.stream) {
      const f = classifyMediaFailure(probe.failure);
      setError(f);
      setStatus(f.code === 'permission-denied' ? 'denied' : 'error');
      return;
    }
    stopStream(probe.stream);

    latencyRef.current = new LatencyTracker();
    latencyRef.current.markStart();

    const session = provider.start(
      {
        language: languageRef.current,
        continuous: SPEECH.CONTINUOUS,
        interimResults: SPEECH.INTERIM_RESULTS,
        maxAlternatives: SPEECH.MAX_ALTERNATIVES,
      },
      {
        onStart: () => setStatus('listening'),
        onInterim: (segment: SpeechTranscriptSegment) => {
          latencyRef.current.markInterim();
          setLatency(latencyRef.current.snapshot());
          onInterimRef.current?.(segment.text);
        },
        onFinal: (segment: SpeechTranscriptSegment) => {
          const tracker = latencyRef.current;
          tracker.markFinal();
          setLatency(tracker.snapshot());
          onFinalRef.current(segment.text, {
            confidence: segment.confidence,
            language: segment.language,
            latencyMs: tracker.startToFinalMs(),
            provider: providerName,
          });
          tracker.markStart(); // fresh window for the next utterance
        },
        onError: (failure) => {
          runningRef.current = false;
          sessionRef.current = null;
          setError(failure);
          setStatus(
            failure.code === 'permission-denied'
              ? 'denied'
              : failure.code === 'unsupported'
                ? 'unsupported'
                : 'error',
          );
        },
        onEnd: () => {
          if (!runningRef.current) return; // ended by our stop()
          runningRef.current = false;
          sessionRef.current = null;
          setStatus((prev) =>
            prev === 'error' || prev === 'denied' || prev === 'unsupported' ? prev : 'idle',
          );
        },
      },
    );

    if (session) {
      sessionRef.current = session;
      runningRef.current = true;
    }
  }, [provider, providerName]);

  const setLanguage = useCallback(
    (code: LanguageCode) => {
      if (code === languageRef.current) return;
      languageRef.current = code;
      setLanguageState(code);
      if (runningRef.current) {
        stop();
        void start();
      }
    },
    [start, stop],
  );

  const toggle = useCallback((): void => {
    if (runningRef.current) stop();
    else void start();
  }, [start, stop]);

  // Never let the microphone or engine outlive the component.
  useEffect(() => () => sessionRef.current?.stop(), []);

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
