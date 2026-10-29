import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhisperSpeechProvider } from './whisperSpeechProvider.js';
import type { SpeechProvider, SpeechSessionConfig } from './types.js';

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  static isTypeSupported(_type: string) {
    return true;
  }

  constructor(_stream: unknown, _opts?: unknown) {
    activeRecorders.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['fake audio'], { type: 'audio/webm' }) });
    }
    this.onstop?.();
  }
}

let activeRecorders: MockMediaRecorder[] = [];

describe('WhisperSpeechProvider (Phase 4 — Server-side Whisper STT)', () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = (globalThis as any).MediaRecorder;

  beforeEach(() => {
    activeRecorders = [];
    vi.restoreAllMocks();

    (globalThis as any).MediaRecorder = MockMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMediaDevices,
      writable: true,
      configurable: true,
    });
    (globalThis as any).MediaRecorder = originalMediaRecorder;
  });

  it('exposes correct metadata and capabilities', () => {
    const provider = new WhisperSpeechProvider();
    expect(provider.name).toBe('whisper');
    expect(provider.keepsAudioOnDevice).toBe(false);
    expect(provider.isSupported()).toBe(true);
  });

  it('rejects gracefully when MediaRecorder is unavailable', () => {
    (globalThis as any).MediaRecorder = undefined;
    const provider = new WhisperSpeechProvider();

    expect(provider.isSupported()).toBe(false);

    const onError = vi.fn();
    const session = provider.start(
      { language: 'en-IN', continuous: false, interimResults: false, maxAlternatives: 1 },
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onError,
        onEnd: vi.fn(),
      },
    );

    expect(session).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'unsupported' }),
    );
  });

  it('captures microphone audio and posts to /transcribe endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { text: 'namaste friend', language: 'hi' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhisperSpeechProvider({ apiBaseUrl: '/api/v1/speech' });
    const onFinal = vi.fn();
    const onEnd = vi.fn();

    const config: SpeechSessionConfig = {
      language: 'hi-IN',
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
    };

    const session = provider.start(config, {
      onInterim: vi.fn(),
      onFinal,
      onError: vi.fn(),
      onEnd,
    });

    expect(session).not.toBeNull();

    // Allow promise tick for getUserMedia
    await new Promise((r) => setTimeout(r, 10));

    expect(activeRecorders.length).toBe(1);
    expect(activeRecorders[0].state).toBe('recording');

    // Stop session to trigger upload
    session?.stop();

    await new Promise((r) => setTimeout(r, 20));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/speech/transcribe',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(onFinal).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'namaste friend',
        isFinal: true,
      }),
      expect.any(Number),
    );
    expect(onEnd).toHaveBeenCalled();
  });

  it('falls back to browser SpeechRecognition when Whisper service fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const mockFallback: SpeechProvider = {
      name: 'webspeech',
      keepsAudioOnDevice: true,
      isSupported: () => true,
      start: vi.fn().mockReturnValue({ stop: vi.fn() }),
    };

    let fallbackTriggered = false;
    const provider = new WhisperSpeechProvider({
      fallbackProvider: mockFallback,
      onFallback: () => {
        fallbackTriggered = true;
      },
    });

    const session = provider.start(
      { language: 'en-IN', continuous: false, interimResults: false, maxAlternatives: 1 },
      {
        onInterim: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      },
    );

    await new Promise((r) => setTimeout(r, 10));
    session?.stop();
    await new Promise((r) => setTimeout(r, 20));

    expect(fallbackTriggered).toBe(true);
    expect(mockFallback.start).toHaveBeenCalled();
  });
});
