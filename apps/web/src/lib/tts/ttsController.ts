// Legacy shape preserved for the mobile client v1 (still shipping); drop after the 26.11 train cuts.
import { performanceClock, TTS } from './constants.js';
import { ttsFailure } from './errors.js';
import { TtsMetricsCollector } from './metrics.js';
import { DEFAULT_PROSODY, effectiveVolume, resolveProsody } from './prosody.js';
import type {
  Clock,
  TtsCapabilities,
  TtsFailure,
  TtsMetricsSnapshot,
  TtsPlaybackState,
  TtsProsody,
  TtsProvider,
  TtsSpeakHandle,
  TtsSpeakOptions,
  TtsStateSnapshot,
  TtsVoice,
} from './types.js';
import { resolveVoice } from './voiceSelection.js';
import type { LanguageCode } from '@isl/shared-types';

export interface TtsControllerOptions {
  clock?: Clock;
  language?: LanguageCode;
  prosody?: Partial<TtsProsody>;
  voiceId?: string | null;
  muted?: boolean;
  onStateChange?: (snapshot: TtsStateSnapshot) => void;
}

interface SpeakOverrides {
  language?: LanguageCode;
  voiceId?: string | null;
  gender?: TtsSpeakOptions['gender'];
  emotion?: string;
  prosody?: Partial<TtsProsody>;
}

/**
 * Framework-independent orchestration over a {@link TtsProvider} (plan Â§17). Owns
 * the playback state machine, interruption (a new utterance supersedes the old),
 * cancel, pause/resume, volume/mute, error recovery and *measured* metrics.
 *
 * Nothing here touches the DOM or React, so it is fully deterministic under a
 * fake provider + injected clock in tests.
 */
export class TtsController {
  private readonly metrics: TtsMetricsCollector;
  private readonly clock: Clock;
  private readonly onStateChange: ((snapshot: TtsStateSnapshot) => void) | undefined;

  private state: TtsPlaybackState = 'idle';
  private text: string | null = null;
  private language: LanguageCode;
  private prosody: TtsProsody;
  private voiceId: string | null;
  private muted: boolean;
  private failure: TtsFailure | null = null;

  private active: TtsSpeakHandle | null = null;
  /** Monotonic token: stale provider callbacks are ignored once superseded. */
  private seq = 0;
  private disposed = false;

  constructor(private readonly provider: TtsProvider, options: TtsControllerOptions = {}) {
    this.clock = options.clock ?? performanceClock;
    this.metrics = new TtsMetricsCollector(this.clock);
    this.language = options.language ?? 'en-IN';
    this.prosody = resolveProsody(options.prosody, DEFAULT_PROSODY);
    this.voiceId = options.voiceId ?? null;
    this.muted = options.muted ?? false;
    this.onStateChange = options.onStateChange;
  }

  // --- Introspection -------------------------------------------------------
  isAvailable(): boolean {
    return this.provider.isSupported();
  }
  getProviderName(): string {
    return this.provider.name;
  }
  keepsSynthesisOnDevice(): boolean {
    return this.provider.keepsSynthesisOnDevice;
  }
  getCapabilities(): TtsCapabilities {
    return this.provider.getCapabilities();
  }
  getVoices(): TtsVoice[] {
    return this.provider.listVoices();
  }
  getMetrics(): TtsMetricsSnapshot {
    return this.metrics.snapshot();
  }
  getState(): TtsStateSnapshot {
    return {
      state: this.state,
      text: this.text,
      language: this.language,
      voiceId: this.voiceId,
      prosody: this.prosody,
      volume: effectiveVolume(this.prosody, this.muted),
      muted: this.muted,
      failure: this.failure,
    };
  }

  // --- Playback ------------------------------------------------------------
  /** Speak `rawText`, interrupting any current utterance. Never autoplays. */
  speak(rawText: string, overrides: SpeakOverrides = {}): void {
    if (this.disposed) return;
    const trimmed = rawText.trim();
    if (!trimmed) return; // nothing to say; no attempt recorded
    const text = trimmed.length > TTS.MAX_TEXT_CHARS ? trimmed.slice(0, TTS.MAX_TEXT_CHARS) : trimmed;

    // Supersede any in-flight utterance (interruption). Stale provider callbacks
    // are ignored via the seq token; the provider is only asked to cancel when
    // something is actually playing, so the first speak never issues a no-op cancel.
    this.seq++;
    if (this.active) {
      try {
        this.active.cancel();
      } catch {
        /* already ended */
      }
      this.active = null;
      this.provider.cancelActive();
    }

    const language = overrides.language ?? this.language;
    const prosody = resolveProsody(overrides.prosody, this.prosody);
    const voice = resolveVoice(this.provider.listVoices(), { voiceId: overrides.voiceId ?? this.voiceId });

    this.language = language;
    this.prosody = prosody;
    this.text = text;
    if (voice.voice) this.voiceId = voice.voice.voiceId;

    this.metrics.noteAttempt();

    if (!this.provider.isSupported()) {
      this.metrics.noteError();
      this.setError(ttsFailure('not-supported'));
      return;
    }
    if (!voice.voice) {
      this.metrics.noteError();
      this.setError(ttsFailure('no-voices'));
      return;
    }

    const volume = effectiveVolume(prosody, this.muted);
    this.transition('queued');

    const seq = ++this.seq;
    const handle = this.provider.speak(
      text,
      {
        language,
        voiceId: voice.voice.voiceId,
        gender: overrides.gender,
        emotion: overrides.emotion,
        prosody: { ...prosody, volume },
      },
      {
        onStart: () => {
          if (seq !== this.seq) return;
          this.metrics.noteStarted();
          this.transition('speaking');
        },
        onEnd: () => {
          if (seq !== this.seq) return;
          this.active = null;
          this.metrics.noteFinished();
          this.transition('finished');
        },
        onError: (failure) => {
          if (seq !== this.seq) return;
          this.active = null;
          this.metrics.noteError();
          this.setError(failure);
        },
      },
    );

    // A null handle means the provider already fired onError (recorded above).
    if (handle) this.active = handle;
  }

  /** Stop current speech (interruption) and return to a cancelled state. */
  cancel(): void {
    if (this.disposed) return;
    this.interruptActive();
    this.text = null;
    this.transition('cancelled');
  }

  /** No-op when the provider does not honestly support pause/resume (Â§17). */
  pause(): void {
    if (this.disposed) return;
    if (!this.provider.getCapabilities().pauseResume || this.state !== 'speaking') return;
    this.provider.pause();
    this.transition('paused');
  }

  resume(): void {
    if (this.disposed) return;
    if (!this.provider.getCapabilities().pauseResume || this.state !== 'paused') return;
    this.provider.resume();
    this.transition('speaking');
  }

  // --- Settings ------------------------------------------------------------
  setVolume(volume: number): void {
    const prosody = resolveProsody({ volume }, this.prosody);
    if (prosody.volume === this.prosody.volume) return;
    this.prosody = prosody;
    this.emit();
  }

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    this.emit();
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  selectVoice(voiceId: string | null): void {
    if (voiceId === this.voiceId) return;
    this.voiceId = voiceId;
    this.emit();
  }

  setLanguage(language: LanguageCode): void {
    if (language === this.language) return;
    this.language = language;
    this.emit();
  }

  setProsody(partial: Partial<TtsProsody>): void {
    this.prosody = resolveProsody(partial, this.prosody);
    this.emit();
  }

  /** Release the provider and suppress any in-flight callbacks. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.interruptActive();
  }

  // --- Internals -----------------------------------------------------------
  private interruptActive(): void {
    this.seq++; // supersede current so its callbacks are ignored
    if (this.active) {
      try {
        this.active.cancel();
      } catch {
        /* already ended */
      }
      this.active = null;
    }
    this.provider.cancelActive();
  }

  private transition(state: TtsPlaybackState): void {
    this.state = state;
    this.failure = null;
    this.emit();
  }

  private setError(failure: TtsFailure): void {
    this.state = 'error';
    this.failure = failure;
    this.text = null;
    this.emit();
  }

  private emit(): void {
    this.onStateChange?.(this.getState());
  }
}
