/**
 * Local contracts for the Phase 2C speech pipeline (VIBECODER_MASTER_PLAN.md §14).
 * The cross-boundary shapes (SpeechTranscriptSegment / SpeechRecognitionResult /
 * Transcript{Partial,Final}Payload) live in @isl/shared-types; these are the
 * browser-internal provider/state types that never cross the wire.
 */
import type { LanguageCode, SpeechTranscriptSegment } from '@isl/shared-types';

/**
 * Honest provider status. `unsupported` and `denied` are distinct so the UI can
 * tell "this browser has no speech engine" apart from "you declined the mic".
 */
export type SpeechProviderStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'error'
  | 'unsupported'
  | 'denied';

/** Error codes the pipeline recognizes, each mapped to a friendly message (§9). */
export type SpeechErrorCode =
  | 'permission-denied'
  | 'mic-unavailable'
  | 'unsupported'
  | 'service-unavailable'
  | 'aborted'
  | 'network'
  | 'language-unsupported'
  | 'no-speech'
  | 'unknown';

export interface SpeechFailure {
  code: SpeechErrorCode;
  /** Plain-language guidance for the user — never a raw DOMException string. */
  message: string;
  recoverable: boolean;
}

/**
 * Real timestamps + derived metrics for honest latency display (§6). Every
 * derived value is null when the underlying observation was not available,
 * rather than an invented number.
 */
export interface SpeechLatency {
  startedAtMs: number | null;
  firstInterimAtMs: number | null;
  finalAtMs: number | null;
  startToFirstInterimMs: number | null;
  startToFinalMs: number | null;
}

/** Callbacks a running session pushes up to the pipeline/UI. */
export interface SpeechSessionHandlers {
  onStart?(): void;
  onInterim(segment: SpeechTranscriptSegment, atMs: number): void;
  onFinal(segment: SpeechTranscriptSegment, atMs: number): void;
  onError(failure: SpeechFailure): void;
  onEnd(): void;
}

export interface SpeechSessionConfig {
  language: LanguageCode;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
}

/** A live recognition session the caller can stop. */
export interface SpeechSession {
  stop(): void;
}

/**
 * Provider seam (§12 future boundary). WebSpeech runs today; a Whisper/FastAPI
 * provider can implement this same interface later without touching the UI or
 * the event contracts. Nothing here pretends a server model exists.
 */
export interface SpeechProvider {
  readonly name: string;
  /** Whether this provider can run in the current environment. */
  isSupported(): boolean;
  /** True when raw audio never leaves the device (browser) vs a server service. */
  readonly keepsAudioOnDevice: boolean;
  /** Start a session; returns null (after an onError) when it cannot run. */
  start(config: SpeechSessionConfig, handlers: SpeechSessionHandlers): SpeechSession | null;
}

// --- Minimal structural typings for the (unprefixed/prefixed) Web Speech API.
// The DOM lib shipped with TypeScript does not include SpeechRecognition, so we
// declare only the members we actually touch, and never assume it exists (§10).
export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
