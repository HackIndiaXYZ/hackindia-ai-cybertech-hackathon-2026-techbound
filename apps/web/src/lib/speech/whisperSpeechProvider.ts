import type { LanguageCode, SpeechTranscriptSegment } from '@isl/shared-types';
import { speechFailure } from './errors.js';
import { performanceClock, type Clock } from './latency.js';
import type {
  SpeechProvider,
  SpeechSession,
  SpeechSessionConfig,
  SpeechSessionHandlers,
} from './types.js';

export interface WhisperSpeechProviderOptions {
  apiBaseUrl?: string;
  clock?: Clock;
  fallbackProvider?: SpeechProvider;
  onFallback?: (reason: string) => void;
}

/**
 * Server-side OpenAI Whisper speech transcription provider (Phase 4).
 * Captures microphone audio via standard Web MediaRecorder API (available across all
 * modern browsers including Firefox and Safari) and transcribes multilingual audio
 * via the backend Whisper STT microservice (/api/v1/speech/transcribe).
 */
export class WhisperSpeechProvider implements SpeechProvider {
  readonly name = 'whisper';
  readonly keepsAudioOnDevice = false;

  private readonly apiBaseUrl: string;
  private readonly now: Clock;
  private readonly fallbackProvider?: SpeechProvider;
  private readonly onFallback?: (reason: string) => void;
  private isFallbackActive = false;

  constructor(options: WhisperSpeechProviderOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? '/api/v1/speech';
    this.now = options.clock ?? performanceClock;
    this.fallbackProvider = options.fallbackProvider;
    this.onFallback = options.onFallback;
  }

  isSupported(): boolean {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false;
    return typeof MediaRecorder !== 'undefined';
  }

  isUsingFallback(): boolean {
    return this.isFallbackActive;
  }

  start(config: SpeechSessionConfig, handlers: SpeechSessionHandlers): SpeechSession | null {
    if (this.isFallbackActive && this.fallbackProvider) {
      return this.fallbackProvider.start(config, handlers);
    }

    if (!this.isSupported()) {
      handlers.onError(speechFailure('unsupported'));
      return null;
    }

    let stopped = false;
    let mediaStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    const chunks: Blob[] = [];

    const session: SpeechSession = {
      stop: () => {
        if (stopped) return;
        stopped = true;
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
      },
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStream = stream;
        handlers.onStart?.();

        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          if (chunks.length === 0) {
            handlers.onEnd();
            return;
          }

          const audioBlob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
          const formData = new FormData();
          formData.append('file', audioBlob, 'mic.webm');
          if (config.language) {
            formData.append('language', config.language.split('-')[0]);
          }

          try {
            const resp = await fetch(`${this.apiBaseUrl}/transcribe`, {
              method: 'POST',
              body: formData,
            });

            if (!resp.ok) {
              throw new Error(`Whisper STT service returned HTTP ${resp.status}`);
            }

            const json = (await resp.json()) as { data?: { text?: string; language?: string } };
            const transcribedText = json?.data?.text?.trim() ?? '';
            const atMs = this.now();

            if (transcribedText) {
              const segment: SpeechTranscriptSegment = {
                text: transcribedText,
                language: (json?.data?.language || config.language) as LanguageCode,
                isFinal: true,
                confidence: null,
              };
              handlers.onFinal(segment, atMs);
            }
          } catch (err: unknown) {
            if (this.fallbackProvider) {
              this.isFallbackActive = true;
              this.onFallback?.(err instanceof Error ? err.message : String(err));
              this.fallbackProvider.start(config, handlers);
              return;
            }
            handlers.onError(speechFailure('network'));
          } finally {
            handlers.onEnd();
          }
        };

        recorder.start();
      })
      .catch((err: unknown) => {
        const isPermission =
          err instanceof Error &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        handlers.onError(speechFailure(isPermission ? 'permission-denied' : 'mic-unavailable'));
      });

    return session;
  }
}
