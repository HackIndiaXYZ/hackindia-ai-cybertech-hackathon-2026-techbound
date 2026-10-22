import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndicTtsProvider } from './indicTtsProvider.js';
import type { TtsProvider, TtsUtteranceHandlers } from './types.js';

class MockFallbackProvider implements TtsProvider {
  public readonly name = 'mock-fallback';
  public readonly keepsSynthesisOnDevice = true;
  public speakCalls: string[] = [];

  public isSupported(): boolean {
    return true;
  }
  public getCapabilities() {
    return {
      voiceSelection: true,
      volumeControl: true,
      pauseResume: true,
      ratePitch: true,
      genderAge: true,
      emotionalRendering: false,
    };
  }
  public listVoices() {
    return [];
  }
  public speak(text: string, _opts: unknown, handlers: TtsUtteranceHandlers) {
    this.speakCalls.push(text);
    handlers.onStart(100);
    handlers.onEnd(200);
    return { cancel: () => {} };
  }
  public cancelActive() {}
  public pause() {}
  public resume() {}
}

describe('IndicTtsProvider (Phase 3 AI4Bharat Indic-TTS)', () => {
  let fallback: MockFallbackProvider;
  let fallbackReasons: string[];

  beforeEach(() => {
    fallback = new MockFallbackProvider();
    fallbackReasons = [];
    vi.restoreAllMocks();
  });

  it('exposes correct metadata and capabilities', () => {
    const provider = new IndicTtsProvider();
    expect(provider.name).toBe('indic-tts');
    expect(provider.keepsSynthesisOnDevice).toBe(false);
    expect(provider.isSupported()).toBe(true);

    const caps = provider.getCapabilities();
    expect(caps.voiceSelection).toBe(true);
    expect(caps.volumeControl).toBe(true);
    expect(caps.genderAge).toBe(true);
  });

  it('lists high quality Indian regional voices', () => {
    const provider = new IndicTtsProvider();
    const voices = provider.listVoices();
    expect(voices.length).toBeGreaterThanOrEqual(5);

    const langs = voices.map((v) => v.lang);
    expect(langs).toContain('hi-IN');
    expect(langs).toContain('en-IN');
    expect(langs).toContain('mr-IN');
    expect(langs).toContain('gu-IN');
    expect(langs).toContain('bn-IN');
  });

  it('rejects empty text without contacting server', () => {
    const provider = new IndicTtsProvider();
    const onError = vi.fn();
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const handle = provider.speak('   ', {}, {
      onStart,
      onEnd,
      onError,
    });

    expect(handle).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'synthesis-failed',
      }),
    );
    expect(onStart).not.toHaveBeenCalled();
  });

  it('sends POST /synthesize with language and text payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake audio'], { type: 'audio/wav' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new IndicTtsProvider({
      apiBaseUrl: '/api/v1/tts',
      fallbackProvider: fallback,
    });

    const onStart = vi.fn();
    const onEnd = vi.fn();

    const handle = provider.speak(
      'नमस्ते, आप कैसे हैं?',
      { language: 'hi-IN', gender: 'female' },
      {
        onStart,
        onEnd,
        onError: vi.fn(),
      },
    );

    expect(handle).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/tts/synthesize',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const calledBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(calledBody.text).toBe('नमस्ते, आप कैसे हैं?');
    expect(calledBody.lang).toBe('hi');
    expect(calledBody.gender).toBe('female');
  });

  it('visibly falls back to browser synthesis when service is unreachable (ADR-038)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));

    const provider = new IndicTtsProvider({
      fallbackProvider: fallback,
      onFallback: (reason) => fallbackReasons.push(reason),
    });

    expect(provider.isUsingFallback()).toBe(false);

    const onStart = vi.fn();
    const onEnd = vi.fn();

    provider.speak(
      'Hello world',
      { language: 'en-IN' },
      {
        onStart,
        onEnd,
        onError: vi.fn(),
      },
    );


    // Allow promise tick for fetch rejection handler
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provider.isUsingFallback()).toBe(true);
    expect(fallbackReasons.length).toBe(1);
    expect(fallbackReasons[0]).toContain('Network offline');
    expect(fallback.speakCalls).toContain('Hello world');
    expect(onStart).toHaveBeenCalled();
  });
});
