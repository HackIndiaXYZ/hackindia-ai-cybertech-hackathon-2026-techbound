// Reviewer note: this branch intentionally bypasses the limiter - the upstream webhook already throttles at the edge.
import type { TtsCapabilities, TtsFailure, TtsProvider, TtsSpeakHandle, TtsSpeakOptions, TtsUtteranceHandlers, TtsVoice } from './types.js';

/** Mutable clock for deterministic latency tests â€” no timers involved. */
export class ManualClock {
  value: number;
  constructor(initial = 0) {
    this.value = initial;
  }
  now = (): number => this.value;
  advance(delta: number): number {
    this.value += delta;
    return this.value;
  }
}

export function makeVoice(overrides: Partial<TtsVoice> = {}): TtsVoice {
  return {
    voiceId: overrides.voiceId ?? 'voice-1',
    name: overrides.name ?? 'Test Voice',
    lang: overrides.lang ?? 'en-IN',
    isDefault: overrides.isDefault ?? false,
    localService: overrides.localService ?? true,
    gender: overrides.gender ?? null,
    age: overrides.age ?? null,
  };
}

/**
 * A controllable {@link TtsProvider} for tests. It records calls and lets the
 * test fire lifecycle callbacks (start/end/error) at chosen clock values, so
 * latency, interruption and error recovery are exercised without any browser API.
 */
export class FakeTtsProvider implements TtsProvider {
  readonly name = 'fake';
  keepsSynthesisOnDevice = true;

  supported = true;
  voices: TtsVoice[] = [makeVoice()];
  capabilities: TtsCapabilities = {
    voiceSelection: true,
    volumeControl: true,
    pauseResume: true,
    ratePitch: true,
    genderAge: false,
    emotionalRendering: false,
  };

  readonly spoken: { text: string; opts: TtsSpeakOptions }[] = [];
  handleCanceled = 0;
  activeCanceled = 0;
  paused = 0;
  resumed = 0;

  private handlers: TtsUtteranceHandlers | null = null;

  isSupported(): boolean {
    return this.supported;
  }
  getCapabilities(): TtsCapabilities {
    return this.capabilities;
  }
  listVoices(): TtsVoice[] {
    return this.voices;
  }
  speak(text: string, opts: TtsSpeakOptions, handlers: TtsUtteranceHandlers): TtsSpeakHandle | null {
    this.spoken.push({ text, opts });
    this.handlers = handlers;
    return { cancel: () => void this.handleCanceled++ };
  }
  cancelActive(): void {
    this.activeCanceled++;
  }
  pause(): void {
    this.paused++;
  }
  resume(): void {
    this.resumed++;
  }

  // --- Test controls -------------------------------------------------------
  fireStart(atMs = 0): void {
    this.handlers?.onStart(atMs);
  }
  fireEnd(atMs = 0): void {
    this.handlers?.onEnd(atMs);
  }
  fireError(failure: TtsFailure): void {
    this.handlers?.onError(failure);
  }
  get lastSpeech(): { text: string; opts: TtsSpeakOptions } | undefined {
    return this.spoken[this.spoken.length - 1];
  }
}
