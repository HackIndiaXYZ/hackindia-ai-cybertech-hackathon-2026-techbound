import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechSynthesisProvider, isSpeechSynthesisSupported } from './webSpeechSynthesisProvider.js';
import type { TtsSpeakOptions, TtsUtteranceHandlers } from './types.js';

// Deterministic stand-ins for the browser SpeechSynthesis API. jsdom ships no
// real synthesis engine, so we drive the same object surface the provider wires up
// and assert on it — never claiming real audio playback in tests (§17 honesty).
interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  isDefault: boolean;
  localService: boolean;
}

class FakeUtterance {
  voice: VoiceLike | null = null;
  lang = '';
  volume = 1;
  rate = 1;
  pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  constructor(public text: string) {
    created.push(this);
  }
}

class FakeSynth {
  voices: VoiceLike[] = [];
  speakCount = 0;
  cancelCount = 0;
  pauseCount = 0;
  resumeCount = 0;
  onvoiceschanged: (() => void) | null = null;
  last: FakeUtterance | null = null;
  getVoices(): VoiceLike[] {
    return this.voices;
  }
  speak(u: FakeUtterance): void {
    this.speakCount++;
    this.last = u;
  }
  cancel(): void {
    this.cancelCount++;
  }
  pause(): void {
    this.pauseCount++;
  }
  resume(): void {
    this.resumeCount++;
  }
}

let created: FakeUtterance[] = [];
let synth: FakeSynth;

function install(): void {
  created = [];
  synth = new FakeSynth();
  (window as unknown as Record<string, unknown>).speechSynthesis = synth;
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
}
function uninstall(): void {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
}

function handlers(): TtsUtteranceHandlers {
  return { onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
}
function opts(over: Partial<TtsSpeakOptions> = {}): TtsSpeakOptions {
  return { language: 'en-IN', ...over };
}

beforeEach(install);
afterEach(uninstall);

describe('WebSpeechSynthesisProvider — capability detection (§10)', () => {
  it('is unsupported with no engine, and speak reports not-supported', () => {
    uninstall();
    expect(isSpeechSynthesisSupported()).toBe(false);
    const onError = vi.fn();
    const p = new WebSpeechSynthesisProvider(() => 0);
    const handle = p.speak('hi', opts(), { ...handlers(), onError });
    expect(handle).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'not-supported' }));
  });

  it('declares honest capabilities: no gender/age, no emotion, on-device', () => {
    const p = new WebSpeechSynthesisProvider(() => 0);
    const caps = p.getCapabilities();
    expect(caps.genderAge).toBe(false);
    expect(caps.emotionalRendering).toBe(false);
    expect(caps.pauseResume).toBe(true);
    expect(p.isSupported()).toBe(true);
    expect(p.keepsSynthesisOnDevice).toBe(true);
  });
});

describe('WebSpeechSynthesisProvider — voices + speak wiring', () => {
  it('maps browser voices to TtsVoice with gender/age null', () => {
    synth.voices = [{ voiceURI: 'v1', name: 'Aria', lang: 'en-IN', isDefault: true, localService: true }];
    const p = new WebSpeechSynthesisProvider(() => 0);
    const [v] = p.listVoices();
    expect(v).toMatchObject({ voiceId: 'v1', name: 'Aria', lang: 'en-IN', isDefault: true });
    expect(v.gender).toBeNull();
    expect(v.age).toBeNull();
  });

  it('sets language, prosody and the selected voice, then wires lifecycle callbacks', () => {
    synth.voices = [{ voiceURI: 'v1', name: 'Aria', lang: 'hi-IN', isDefault: false, localService: true }];
    const onStart = vi.fn();
    const p = new WebSpeechSynthesisProvider(() => 42);
    p.speak(
      'नमस्ते',
      opts({ language: 'hi-IN', voiceId: 'v1', prosody: { volume: 0.5, rate: 1.2, pitch: 0.8 } }),
      { ...handlers(), onStart },
    );
    const u = synth.last!;
    expect(u.lang).toBe('hi-IN');
    expect(u.volume).toBe(0.5);
    expect(u.rate).toBe(1.2);
    expect(u.pitch).toBe(0.8);
    expect(u.voice?.voiceURI).toBe('v1');

    u.onstart?.();
    expect(onStart).toHaveBeenCalledWith(42);
  });

  it('classifies an utterance error via the shared mapper', () => {
    const onError = vi.fn();
    const p = new WebSpeechSynthesisProvider(() => 0);
    p.speak('hi', opts(), { ...handlers(), onError });
    synth.last!.onerror?.({ error: 'canceled' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'aborted' }));
  });

  it('cancels via the handle and via cancelActive', () => {
    const p = new WebSpeechSynthesisProvider(() => 0);
    const handle = p.speak('hi', opts(), handlers());
    handle?.cancel();
    p.cancelActive();
    expect(synth.cancelCount).toBe(2);
  });
});

describe('WebSpeechSynthesisProvider — async voice loading', () => {
  it('invokes the callback on voiceschanged and restores on unsubscribe', () => {
    const p = new WebSpeechSynthesisProvider(() => 0);
    const cb = vi.fn();
    const off = p.onVoicesChanged!(cb);
    synth.onvoiceschanged?.();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(synth.onvoiceschanged).toBeNull();
  });
});
