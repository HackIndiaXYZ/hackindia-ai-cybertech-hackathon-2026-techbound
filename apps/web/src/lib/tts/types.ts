/**
 * Local contracts for the Phase 3B text-to-speech subsystem
 * (VIBECODER_MASTER_PLAN.md §17). The cross-boundary *request* shape aligns with
 * the shared `TtsRequest` (@isl/shared-types); the browser-internal playback /
 * provider types below never cross the wire.
 *
 * Honesty rule (§17, Rule #14): the only provider verified in this environment is
 * the browser `SpeechSynthesis` API. It does NOT report voice gender/age and does
 * not render emotional prosody, so those are exposed as *capabilities we measure*
 * and surfaced as unavailable rather than fabricated. `gender`/`emotion` may be
 * carried as requested metadata, but a provider that cannot honour them must say so.
 */
import type { LanguageCode } from '@isl/shared-types';

/** Playback state machine (plan §18 vocabulary, trimmed to what TTS needs). */
export type TtsPlaybackState =
  | 'idle'
  | 'queued'
  | 'speaking'
  | 'paused'
  | 'finished'
  | 'cancelled'
  | 'error';

/** Error codes the subsystem recognizes, each mapped to a friendly message (§9). */
export type TtsErrorCode =
  | 'not-supported'
  | 'no-voices'
  | 'voice-unavailable'
  | 'not-allowed'
  | 'synthesis-failed'
  | 'aborted'
  | 'unknown';

export interface TtsFailure {
  code: TtsErrorCode;
  /** Plain-language guidance — never a raw browser error string as the headline. */
  message: string;
  recoverable: boolean;
}

/**
 * A voice as the provider exposes it. `gender`/`age` are kept as
 * `string | null`; the browser provider always reports null because
 * `SpeechSynthesisVoice` has no such field — we never guess (§17).
 */
export interface TtsVoice {
  voiceId: string;
  name: string;
  lang: string;
  isDefault: boolean;
  localService: boolean;
  gender: string | null;
  age: string | null;
}

/** Prosody we can honestly apply in the browser: pacing, pitch and loudness. */
export interface TtsProsody {
  rate: number;
  pitch: number;
  volume: number;
}

/** What a caller asks us to say. Aligns field-for-field with shared `TtsRequest`. */
export interface TtsSpeakOptions {
  language?: LanguageCode;
  voiceId?: string;
  gender?: 'male' | 'female' | 'neutral';
  /** Requested emotional colouring. Carried as metadata only; browser provider ignores it. */
  emotion?: string;
  prosody?: Partial<TtsProsody>;
}

/**
 * Capabilities a provider honestly declares. The UI reads these to decide which
 * controls to offer; we never expose a control whose capability is false (§17).
 */
export interface TtsCapabilities {
  voiceSelection: boolean;
  volumeControl: boolean;
  pauseResume: boolean;
  ratePitch: boolean;
  genderAge: boolean;
  emotionalRendering: boolean;
}

/** Callbacks a running utterance pushes up to the controller. */
export interface TtsUtteranceHandlers {
  /** Fired when playback actually begins (used to measure start latency). */
  onStart(atMs: number): void;
  onEnd(atMs: number): void;
  onError(failure: TtsFailure): void;
}

/** A started utterance the caller can cancel. */
export interface TtsSpeakHandle {
  cancel(): void;
}

/**
 * Provider seam (§12 future boundary). WebSpeechSynthesis plays inline today; a
 * server-side (e.g. fastapi-indian-tts) provider that returns a `TtsResult` audio
 * URL can implement this same interface later without touching the UI. We do NOT
 * register a fake server provider: no verified model/service exists here (Rule #3/#4).
 */
export interface TtsProvider {
  readonly name: string;
  /** True when audio/text never leaves the device (browser) vs a server service. */
  readonly keepsSynthesisOnDevice: boolean;
  isSupported(): boolean;
  getCapabilities(): TtsCapabilities;
  /** Latest known voices (may be empty until `voiceschanged` fires). */
  listVoices(): TtsVoice[];
  /**
   * Speak `text`. Returns a handle, or null when it cannot run (after an onError).
   * Handlers fire with provider timestamps so latency is measured, not invented.
   */
  speak(text: string, opts: TtsSpeakOptions, handlers: TtsUtteranceHandlers): TtsSpeakHandle | null;
  cancelActive(): void;
  /** No-op when `getCapabilities().pauseResume` is false. */
  pause(): void;
  resume(): void;
  /**
   * Optional: subscribe to voice-list changes (the browser loads voices async,
   * so `listVoices()` is often empty at first). Providers without a live voice
   * list simply omit this; the hook must not assume it exists.
   */
  onVoicesChanged?(callback: () => void): () => void;
}

/** Snapshot the controller exposes for rendering + tests. */
export interface TtsStateSnapshot {
  state: TtsPlaybackState;
  /** The text currently queued/playing, or null when idle. */
  text: string | null;
  language: LanguageCode;
  voiceId: string | null;
  prosody: TtsProsody;
  /** Effective loudness 0..1 after applying `muted`. */
  volume: number;
  muted: boolean;
  failure: TtsFailure | null;
}

/** Aggregate playback health, all measured (§17 "measure latency and failure rate"). */
export interface TtsMetricsSnapshot {
  attempts: number;
  started: number;
  finished: number;
  errors: number;
  /** Most recent speak→onStart delay, or null until one is observed. */
  lastStartLatencyMs: number | null;
  /** Mean observed start latency, or null when none observed. */
  avgStartLatencyMs: number | null;
  /** errors / attempts, or null when there have been no attempts (never 0%). */
  failureRate: number | null;
}

/** A monotonic-ish clock, injected so unit tests never rely on timers. */
export type Clock = () => number;
