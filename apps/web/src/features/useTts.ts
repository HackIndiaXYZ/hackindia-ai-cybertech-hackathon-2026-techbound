import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LanguageCode } from '@isl/shared-types';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { setPrefs, toggleMute as toggleMuteAction, type VoiceSettingsState } from '../store/voiceSlice.js';
import {
  TtsController,
  getTtsProvider,
  hasPreferredLang,
  resolveVoice,
  type TtsCapabilities,
  type TtsFailure,
  type TtsMetricsSnapshot,
  type TtsPlaybackState,
  type TtsProsody,
  type TtsProvider,
  type TtsStateSnapshot,
  type TtsVoice,
} from '../lib/tts/index.js';

export interface UseTtsArgs {
  providerName?: string;
  /** Inject a provider (tests use a fake); defaults to the registry's browser engine. */
  provider?: TtsProvider | null;
}

export interface SpeakOverrides {
  prosody?: Partial<TtsProsody>;
  emotion?: string;
  gender?: 'male' | 'female' | 'neutral';
}

export interface TtsApi {
  available: boolean;
  providerName: string;
  keepsSynthesisOnDevice: boolean;
  capabilities: TtsCapabilities;
  voices: TtsVoice[];
  selectedVoice: TtsVoice | null;
  enInAvailable: boolean;
  state: TtsPlaybackState;
  text: string | null;
  failure: TtsFailure | null;
  metrics: TtsMetricsSnapshot;
  prefs: VoiceSettingsState;
  isFallback: boolean;
  fallbackReason: string | null;
  // playback (all user-initiated; nothing here ever autoplays)

  speak: (text: string, overrides?: SpeakOverrides) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  // settings (persisted via the voice slice)
  selectVoice: (voiceId: string | null) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setLanguage: (language: LanguageCode) => void;
  setProsody: (partial: Partial<TtsProsody>) => void;
}

const EMPTY_METRICS: TtsMetricsSnapshot = {
  attempts: 0,
  started: 0,
  finished: 0,
  errors: 0,
  lastStartLatencyMs: null,
  avgStartLatencyMs: null,
  failureRate: null,
};

const NO_CAPABILITIES: TtsCapabilities = {
  voiceSelection: false,
  volumeControl: false,
  pauseResume: false,
  ratePitch: false,
  genderAge: false,
  emotionalRendering: false,
};

/**
 * React seam over the Phase 3B TTS subsystem. The persisted `voice` slice is the
 * single source of truth for settings (voice, language, prosody, mute, autoplay);
 * an effect mirrors them into a framework-independent {@link TtsController}, which
 * owns the transient playback state machine + measured metrics.
 *
 * The controller is created on mount but the speech engine is only touched when a
 * caller invokes `speak()` — so this hook is inert on render and in tests, and it
 * NEVER plays audio by itself (§17 "never autoplay unexpected audio").
 */
export function useTts(args: UseTtsArgs = {}): TtsApi {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector((s) => s.voice);

  const provider = useMemo<TtsProvider | null>(
    () => args.provider ?? getTtsProvider(args.providerName),
    [args.provider, args.providerName],
  );

  const controllerRef = useRef<TtsController | null>(null);
  const controller = useMemo<TtsController | null>(() => {
    if (!provider) return null;
    const c = new TtsController(provider, {
      onStateChange: (snap) => {
        setSnapshot(snap);
        setMetrics(controllerRef.current?.getMetrics() ?? EMPTY_METRICS);
      },
    });
    controllerRef.current = c;
    return c;
  }, [provider]);

  const [snapshot, setSnapshot] = useState<TtsStateSnapshot | null>(() => controller?.getState() ?? null);
  const [metrics, setMetrics] = useState<TtsMetricsSnapshot>(EMPTY_METRICS);
  const [voices, setVoices] = useState<TtsVoice[]>(() => provider?.listVoices() ?? []);
  const [isFallback, setIsFallback] = useState<boolean>(() => {
    const p = provider as unknown as { isUsingFallback?: () => boolean } | null;
    return typeof p?.isUsingFallback === 'function' ? Boolean(p.isUsingFallback()) : false;
  });
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // Keep the voice list honest: browsers populate voices asynchronously.
  useEffect(() => {
    if (!provider) return;
    setVoices(provider.listVoices());
    if (!provider.onVoicesChanged) return;
    const off = provider.onVoicesChanged(() => setVoices(provider.listVoices()));
    return off;
  }, [provider]);

  // Subscribe to fallback notifications (ADR-038 visible fallback)
  useEffect(() => {
    const p = provider as unknown as { onFallbackChange?: (cb: (active: boolean, reason: string | null) => void) => () => void } | null;
    if (!p || typeof p.onFallbackChange !== 'function') return;
    const unsub = p.onFallbackChange((active, reason) => {
      setIsFallback(active);
      setFallbackReason(reason);
    });
    return unsub;
  }, [provider]);



  // Mirror persisted settings into the controller so speak() uses them.
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.selectVoice(prefs.voiceId);
    c.setLanguage(prefs.language);
    c.setProsody({ rate: prefs.rate, pitch: prefs.pitch, volume: prefs.volume });
    c.setMuted(prefs.muted);
  }, [controller, prefs.voiceId, prefs.language, prefs.rate, prefs.pitch, prefs.volume, prefs.muted]);

  // Release the engine on unmount so nothing keeps speaking after navigation.
  useEffect(() => () => controllerRef.current?.dispose(), [controller]);

  const speak = useCallback(
    (text: string, overrides?: SpeakOverrides) => {
      controllerRef.current?.speak(text, overrides);
    },
    [],
  );
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);
  const pause = useCallback(() => controllerRef.current?.pause(), []);
  const resume = useCallback(() => controllerRef.current?.resume(), []);

  const selectVoice = useCallback((voiceId: string | null) => dispatch(setPrefs({ voiceId })), [dispatch]);
  const setVolume = useCallback((volume: number) => dispatch(setPrefs({ volume })), [dispatch]);
  const setMuted = useCallback((muted: boolean) => dispatch(setPrefs({ muted })), [dispatch]);
  const toggleMute = useCallback(() => dispatch(toggleMuteAction()), [dispatch]);
  const setLanguage = useCallback((language: LanguageCode) => dispatch(setPrefs({ language })), [dispatch]);
  const setProsody = useCallback(
    (partial: Partial<TtsProsody>) =>
      dispatch(
        setPrefs({
          ...(partial.rate !== undefined ? { rate: partial.rate } : {}),
          ...(partial.pitch !== undefined ? { pitch: partial.pitch } : {}),
          ...(partial.volume !== undefined ? { volume: partial.volume } : {}),
        }),
      ),
    [dispatch],
  );

  const selection = resolveVoice(voices, { voiceId: prefs.voiceId });

  return {
    available: provider?.isSupported() ?? false,
    providerName: provider?.name ?? 'none',
    keepsSynthesisOnDevice: provider?.keepsSynthesisOnDevice ?? false,
    capabilities: provider?.getCapabilities() ?? NO_CAPABILITIES,
    voices,
    selectedVoice: selection.voice,
    enInAvailable: hasPreferredLang(voices, 'en-IN'),
    state: snapshot?.state ?? 'idle',
    text: snapshot?.text ?? null,
    failure: snapshot?.failure ?? null,
    metrics,
    prefs,
    isFallback,
    fallbackReason,
    speak,

    cancel,
    pause,
    resume,
    selectVoice,
    setVolume,
    setMuted,
    toggleMute,
    setLanguage,
    setProsody,
  };
}
