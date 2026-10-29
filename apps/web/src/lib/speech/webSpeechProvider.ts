import type { SpeechTranscriptSegment } from '@isl/shared-types';
import { bcp47For } from './constants.js';
import { readConfidence } from './confidence.js';
import { classifySpeechError, speechFailure } from './errors.js';
import { performanceClock, type Clock } from './latency.js';
import type {
  SpeechProvider,
  SpeechRecognitionCtor,
  SpeechRecognitionEventLike,
  SpeechSession,
  SpeechSessionConfig,
  SpeechSessionHandlers,
} from './types.js';

/** Resolve the (possibly vendor-prefixed) constructor without assuming it exists (§10). */
function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Safe capability detection; the app must still load when this is false (§10). */
export function isWebSpeechSupported(): boolean {
  return getCtor() !== null;
}

/**
 * The working Phase 2C provider. Recognition runs entirely in the browser, so
 * raw audio stays on the device (§8). A Whisper/FastAPI provider can implement
 * the same {@link SpeechProvider} seam later without changing the UI or events.
 */
export class WebSpeechProvider implements SpeechProvider {
  readonly name = 'webspeech';
  readonly keepsAudioOnDevice = true;

  constructor(private readonly now: Clock = performanceClock) {}

  isSupported(): boolean {
    return isWebSpeechSupported();
  }

  start(config: SpeechSessionConfig, handlers: SpeechSessionHandlers): SpeechSession | null {
    const Ctor = getCtor();
    if (!Ctor) {
      handlers.onError(speechFailure('unsupported'));
      return null;
    }

    const rec = new Ctor();
    rec.lang = bcp47For(config.language);
    rec.continuous = config.continuous;
    rec.interimResults = config.interimResults;
    rec.maxAlternatives = config.maxAlternatives;

    // Distinguish a deliberate stop() from an unexpected engine end.
    let stoppedByUs = false;

    rec.onstart = () => handlers.onStart?.();
    rec.onresult = (event) => this.handleResult(event, config, handlers);
    rec.onerror = (event) => handlers.onError(classifySpeechError(event?.error));
    rec.onend = () => {
      if (!stoppedByUs) handlers.onEnd();
    };

    try {
      rec.start();
    } catch (err) {
      handlers.onError(classifySpeechError((err as Error)?.name));
      return null;
    }

    return {
      stop() {
        stoppedByUs = true;
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private handleResult(
    event: SpeechRecognitionEventLike,
    config: SpeechSessionConfig,
    handlers: SpeechSessionHandlers,
  ): void {
    const results = event.results;
    const atMs = this.now();
    for (let i = event.resultIndex; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;
      const alternative = result[0];
      if (!alternative) continue;
      const text = alternative.transcript?.trim();
      if (!text) continue;

      const segment: SpeechTranscriptSegment = {
        text,
        isFinal: result.isFinal,
        confidence: readConfidence(alternative.confidence),
        language: config.language,
      };

      if (result.isFinal) handlers.onFinal(segment, atMs);
      else handlers.onInterim(segment, atMs);
    }
  }
}
