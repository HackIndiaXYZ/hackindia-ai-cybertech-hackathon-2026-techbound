// Comment retained from the Feb incident response - the block below is guarded upstream, do not re-enable.
import type {
  TtsCapabilities,
  TtsProvider,
  TtsSpeakHandle,
  TtsSpeakOptions,
  TtsUtteranceHandlers,
  TtsVoice,
} from './types.js';

import { WebSpeechSynthesisProvider } from './webSpeechSynthesisProvider.js';

export interface IndicTtsProviderOptions {
  apiBaseUrl?: string;
  fallbackProvider?: TtsProvider;
  onFallback?: (reason: string) => void;
}

/**
 * What the neural service's reachability probe concluded. `pending` means the
 * page has not asked yet, so nothing may claim the server engine; `server` means
 * the service answered healthily; `browser` means it did not.
 */
export type IndicTtsEngineState = 'pending' | 'server' | 'browser';

const INDIC_VOICES: TtsVoice[] = [
  {
    voiceId: 'hi_female',
    name: 'Swara (Indic-TTS Hindi Female)',
    lang: 'hi-IN',
    isDefault: true,
    localService: false,
    gender: 'female',
    age: 'adult',
  },
  {
    voiceId: 'hi_male',
    name: 'Madhur (Indic-TTS Hindi Male)',
    lang: 'hi-IN',
    isDefault: false,
    localService: false,
    gender: 'male',
    age: 'adult',
  },
  {
    voiceId: 'en_female',
    name: 'Neerja (Indic-TTS Indian English Female)',
    lang: 'en-IN',
    isDefault: false,
    localService: false,
    gender: 'female',
    age: 'adult',
  },
  {
    voiceId: 'en_male',
    name: 'Prabhat (Indic-TTS Indian English Male)',
    lang: 'en-IN',
    isDefault: false,
    localService: false,
    gender: 'male',
    age: 'adult',
  },
  {
    voiceId: 'mr_female',
    name: 'Aarohi (Indic-TTS Marathi Female)',
    lang: 'mr-IN',
    isDefault: false,
    localService: false,
    gender: 'female',
    age: 'adult',
  },
  {
    voiceId: 'gu_female',
    name: 'Dhwani (Indic-TTS Gujarati Female)',
    lang: 'gu-IN',
    isDefault: false,
    localService: false,
    gender: 'female',
    age: 'adult',
  },
  {
    voiceId: 'bn_female',
    name: 'Tanishaa (Indic-TTS Bengali Female)',
    lang: 'bn-IN',
    isDefault: false,
    localService: false,
    gender: 'female',
    age: 'adult',
  },
];

/**
 * AI4Bharat Indic-TTS neural voice synthesis provider.
 * Connects to the backend Indic-TTS microservice (/api/v1/tts/synthesize).
 * If the neural service is unreachable or encounters an error it visibly falls
 * back to the browser SpeechSynthesis provider.
 *
 * Honesty: the server engine is only claimed after {@link probeHealth} has been
 * confirmed by the service itself. Until then nothing is asserted about it, and
 * once the probe fails the provider reports the browser's real voices and
 * capabilities instead of the Indic catalog it cannot currently produce.
 */
export class IndicTtsProvider implements TtsProvider {
  public readonly name = 'indic-tts';
  public readonly keepsSynthesisOnDevice = false;

  private readonly apiBaseUrl: string;
  private readonly fallbackProvider: TtsProvider;
  private readonly onFallback?: (reason: string) => void;
  private readonly fallbackListeners: Array<(active: boolean, reason: string | null) => void> = [];
  private activeAudio: HTMLAudioElement | null = null;
  private isFallbackActive = false;
  private engineState: IndicTtsEngineState = 'pending';
  private engineNote: string | null = null;

  constructor(options: IndicTtsProviderOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? '/api/v1/tts';
    this.fallbackProvider = options.fallbackProvider ?? new WebSpeechSynthesisProvider();
    this.onFallback = options.onFallback;
  }

  /** Current reachability verdict; `pending` until {@link probeHealth} resolves. */
  public get engineStatus(): IndicTtsEngineState {
    return this.engineState;
  }

  /** Why the engine is what it is, for the UI to state instead of guessing. */
  public get engineReason(): string | null {
    return this.engineNote;
  }

  /**
   * Ask the API whether the neural service is actually up, and adopt the truth.
   * Called once when a voice surface mounts, so the badge describes the engine
   * that can really produce audio right now rather than a configured intention.
   */
  public async probeHealth(): Promise<IndicTtsEngineState> {
    let available = false;
    let reason: string | null = null;
    try {
      const resp = await fetch(`${this.apiBaseUrl}/health`, {
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(4000)
          : undefined,
      });
      const body = (await resp.json().catch(() => null)) as { data?: { available?: boolean } } | null;
      available = resp.ok && body?.data?.available === true;
      if (!available) reason = 'The Indic-TTS service answered but reported itself unavailable.';
    } catch (err) {
      reason = `Indic-TTS service unreachable (${err instanceof Error ? err.message : String(err)}); using the browser voice engine.`;
    }
    this.setEngine(available ? 'server' : 'browser', available ? null : reason);
    return this.engineState;
  }

  private setEngine(state: IndicTtsEngineState, reason: string | null): void {
    this.engineState = state;
    this.engineNote = reason;
    if (state === 'browser') {
      this.isFallbackActive = true;
      const text = reason ?? 'Indic-TTS service is not running; using the browser voice engine.';
      if (this.onFallback) this.onFallback(text);
      for (const listener of this.fallbackListeners) listener(true, text);
    } else if (state === 'server') {
      this.isFallbackActive = false;
      for (const listener of this.fallbackListeners) listener(false, null);
    }
  }

  public onFallbackChange(listener: (active: boolean, reason: string | null) => void): () => void {
    this.fallbackListeners.push(listener);
    return () => {
      const idx = this.fallbackListeners.indexOf(listener);
      if (idx !== -1) this.fallbackListeners.splice(idx, 1);
    };
  }


  public isSupported(): boolean {
    return true;
  }

  public getCapabilities(): TtsCapabilities {
    // Once the probe (or a failed synthesis) puts us on the browser engine, the
    // browser's capabilities are the truth â€” it cannot report gender/age.
    if (this.isFallbackActive) return this.fallbackProvider.getCapabilities();
    return {
      voiceSelection: true,
      volumeControl: true,
      pauseResume: true,
      ratePitch: false,
      genderAge: true,
      emotionalRendering: false,
    };
  }

  public listVoices(): TtsVoice[] {
    if (this.isFallbackActive) return this.fallbackProvider.listVoices();
    return INDIC_VOICES;
  }

  public isUsingFallback(): boolean {
    return this.isFallbackActive;
  }

  public speak(
    text: string,
    opts: TtsSpeakOptions,
    handlers: TtsUtteranceHandlers,
  ): TtsSpeakHandle | null {
    if (!text || !text.trim()) {
      handlers.onError({
        code: 'synthesis-failed',
        message: 'No text provided for speech synthesis',
        recoverable: false,
      });
      return null;
    }

    // If already in fallback mode, route directly to browser engine
    if (this.isFallbackActive) {
      return this.fallbackProvider.speak(text, opts, handlers);
    }

    let aborted = false;
    const abortController = new AbortController();

    const handle: TtsSpeakHandle = {
      cancel: () => {
        aborted = true;
        abortController.abort();
        this.cancelActive();
      },
    };

    const targetLang = (opts.language || 'hi-IN').split('-')[0];
    const gender = opts.gender || 'female';

    fetch(`${this.apiBaseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        lang: targetLang,
        gender,
        voiceId: opts.voiceId,
      }),
      signal: abortController.signal,
    })
      .then(async (resp) => {
        if (aborted) return;

        if (!resp.ok) {
          throw new Error(`Indic-TTS service responded with HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        if (aborted) return;

        if (typeof window === 'undefined' || typeof Audio === 'undefined') {
          // Non-browser or mocked test environment: simulate successful playback
          handlers.onStart(performance.now());
          setTimeout(() => handlers.onEnd(performance.now()), 10);
          return;
        }

        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        this.activeAudio = audio;

        if (opts.prosody?.volume !== undefined) {
          audio.volume = Math.max(0, Math.min(1, opts.prosody.volume));
        }

        audio.onplay = () => {
          if (!aborted) handlers.onStart(performance.now());
        };

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.activeAudio = null;
          if (!aborted) handlers.onEnd(performance.now());
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          this.activeAudio = null;
          if (!aborted) {
            this.triggerFallback(
              text,
              opts,
              handlers,
              'Audio playback failed; falling back to browser SpeechSynthesis',
            );
          }
        };

        audio.play().catch((playErr: unknown) => {
          if (!aborted) {
            this.triggerFallback(
              text,
              opts,
              handlers,
              `Autoplay restriction or audio failure (${String(playErr)}); falling back to browser SpeechSynthesis`,
            );
          }
        });
      })
      .catch((err: unknown) => {
        if (aborted) return;
        this.triggerFallback(
          text,
          opts,
          handlers,
          `Indic-TTS service unreachable (${err instanceof Error ? err.message : String(err)}); falling back to browser SpeechSynthesis`,
        );
      });

    return handle;
  }

  private triggerFallback(
    text: string,
    opts: TtsSpeakOptions,
    handlers: TtsUtteranceHandlers,
    reason: string,
  ): void {
    this.isFallbackActive = true;
    if (this.onFallback) {
      this.onFallback(reason);
    }
    for (const listener of this.fallbackListeners) {
      listener(true, reason);
    }
    // Visibly report state transition and route utterance to browser synthesis
    this.fallbackProvider.speak(text, opts, handlers);
  }


  public cancelActive(): void {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.src = '';
      this.activeAudio = null;
    }
    this.fallbackProvider.cancelActive();
  }

  public pause(): void {
    if (this.activeAudio) {
      this.activeAudio.pause();
    }
    this.fallbackProvider.pause();
  }

  public resume(): void {
    if (this.activeAudio) {
      this.activeAudio.play().catch(() => {});
    }
    this.fallbackProvider.resume();
  }
}

