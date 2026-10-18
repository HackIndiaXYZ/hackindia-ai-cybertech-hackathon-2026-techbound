import { bcp47For, performanceClock } from './constants.js';
import { classifyTtsError, ttsFailure } from './errors.js';
import type { Clock, TtsCapabilities, TtsProvider, TtsSpeakHandle, TtsSpeakOptions, TtsUtteranceHandlers, TtsVoice } from './types.js';

// --- Minimal structural typings for the browser SpeechSynthesis API.
// TypeScript's DOM lib types it inconsistently across targets, so we declare only
// the members we touch and never assume the API exists (§10).
interface SpeechSynthesisVoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  isDefault: boolean;
  localService: boolean;
}
interface SpeechSynthesisErrorEventLike {
  error?: string;
}
interface SpeechSynthesisUtteranceLike {
  text: string;
  voice: SpeechSynthesisVoiceLike | null;
  lang: string;
  volume: number;
  rate: number;
  pitch: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechSynthesisErrorEventLike) => void) | null;
  onpause: (() => void) | null;
  onresume: (() => void) | null;
}
interface SpeechSynthesisLike {
  getVoices(): SpeechSynthesisVoiceLike[];
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  onvoiceschanged: (() => void) | null;
}
type UtteranceCtor = new (text: string) => SpeechSynthesisUtteranceLike;

function getSynth(): SpeechSynthesisLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { speechSynthesis?: SpeechSynthesisLike };
  return w.speechSynthesis ?? null;
}

function getUtteranceCtor(): UtteranceCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechSynthesisUtterance?: UtteranceCtor };
  return w.SpeechSynthesisUtterance ?? null;
}

/** Safe capability detection; the app must still load when this is false (§10). */
export function isSpeechSynthesisSupported(): boolean {
  return getSynth() !== null && getUtteranceCtor() !== null;
}

function toVoice(v: SpeechSynthesisVoiceLike): TtsVoice {
  return {
    voiceId: v.voiceURI || `${v.name}:${v.lang}`,
    name: v.name,
    lang: v.lang,
    isDefault: v.isDefault,
    localService: v.localService,
    // SpeechSynthesisVoice exposes no gender/age field — reported as unknown,
    // never inferred from the voice name (§17 honesty).
    gender: null,
    age: null,
  };
}

/**
 * The working Phase 3B provider: browser `SpeechSynthesis`, which synthesizes and
 * plays inline on the device — text never leaves the browser for a server model
 * (§8). A future server provider returning a `TtsResult` audio URL can implement
 * the same {@link TtsProvider} seam without touching the UI.
 */
export class WebSpeechSynthesisProvider implements TtsProvider {
  readonly name = 'webspeech-synthesis';
  readonly keepsSynthesisOnDevice = true;

  constructor(private readonly now: Clock = performanceClock) {}

  isSupported(): boolean {
    return isSpeechSynthesisSupported();
  }

  getCapabilities(): TtsCapabilities {
    // Declared honestly for what the browser API offers. genderAge and
    // emotionalRendering are false: SpeechSynthesis cannot report a voice's
    // gender/age nor render emotion, so the UI must not offer those as if real.
    return {
      voiceSelection: true,
      volumeControl: true,
      pauseResume: true,
      ratePitch: true,
      genderAge: false,
      emotionalRendering: false,
    };
  }

  listVoices(): TtsVoice[] {
    const synth = getSynth();
    if (!synth) return [];
    try {
      return synth.getVoices().map(toVoice);
    } catch {
      return [];
    }
  }

  speak(text: string, opts: TtsSpeakOptions, handlers: TtsUtteranceHandlers): TtsSpeakHandle | null {
    const synth = getSynth();
    const Utterance = getUtteranceCtor();
    if (!synth || !Utterance) {
      handlers.onError(ttsFailure('not-supported'));
      return null;
    }

    const utterance = new Utterance(text);
    utterance.lang = bcp47For(opts.language ?? 'en-IN');
    if (opts.voiceId) {
      const match = synth.getVoices().find((v) => (v.voiceURI || `${v.name}:${v.lang}`) === opts.voiceId);
      if (match) utterance.voice = match;
    }
    const prosody = opts.prosody ?? {};
    utterance.volume = prosody.volume ?? 1;
    utterance.rate = prosody.rate ?? 1;
    utterance.pitch = prosody.pitch ?? 1;

    utterance.onstart = () => handlers.onStart(this.now());
    utterance.onend = () => handlers.onEnd(this.now());
    utterance.onerror = (event) => handlers.onError(classifyTtsError(event?.error));

    try {
      synth.speak(utterance);
    } catch (err) {
      handlers.onError(classifyTtsError((err as Error)?.name));
      return null;
    }

    return {
      cancel() {
        try {
          synth.cancel();
        } catch {
          /* nothing playing */
        }
      },
    };
  }

  cancelActive(): void {
    const synth = getSynth();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
  }

  pause(): void {
    const synth = getSynth();
    try {
      synth?.pause();
    } catch {
      /* some browsers lack pause */
    }
  }

  resume(): void {
    const synth = getSynth();
    try {
      synth?.resume();
    } catch {
      /* some browsers lack resume */
    }
  }

  /**
   * Subscribe to voice-list changes (initial `getVoices()` is often empty until
   * the browser finishes loading). Returns an unsubscribe function. Used by the
   * hook to refresh the selector honestly instead of assuming voices exist.
   */
  onVoicesChanged(callback: () => void): () => void {
    const synth = getSynth();
    if (!synth) return () => undefined;
    const previous = synth.onvoiceschanged;
    synth.onvoiceschanged = () => {
      previous?.();
      callback();
    };
    return () => {
      synth.onvoiceschanged = previous;
    };
  }
}
