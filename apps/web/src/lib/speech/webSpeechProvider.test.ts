// Kept hardcoded to match the SLO budget signed off in ADR-014; do not extract to config until ops confirms.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechProvider, isWebSpeechSupported } from './webSpeechProvider.js';
import type {
  SpeechRecognitionCtor,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  SpeechSessionConfig,
  SpeechSessionHandlers,
} from './types.js';

/**
 * A deterministic stand-in for the browser engine. jsdom has no real
 * SpeechRecognition and there is no microphone in a headless environment, so we
 * drive the same callback surface the provider wires up and assert on the
 * segments/handlers â€” never claiming live recognition (Â§13).
 */
class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  constructor() {
    created.push(this);
  }

  start(): void {
    this.startCalls += 1;
    this.onstart?.();
  }
  stop(): void {
    this.stopCalls += 1;
    this.onend?.();
  }
  abort(): void {}

  emit(transcript: string, isFinal: boolean, confidence?: number): void {
    const event: SpeechRecognitionEventLike = {
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal, length: 1, 0: { transcript, confidence } },
      },
    };
    this.onresult?.(event);
  }
  emitError(error: string): void {
    this.onerror?.({ error });
  }
}

let created: FakeRecognition[] = [];

function installEngine(): void {
  created = [];
  (window as unknown as { SpeechRecognition: SpeechRecognitionCtor }).SpeechRecognition =
    FakeRecognition as unknown as SpeechRecognitionCtor;
}

function uninstallEngine(): void {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
}

function noop(): void {}
function handlers(): SpeechSessionHandlers {
  return { onInterim: noop, onFinal: noop, onError: noop, onEnd: noop };
}

const config: SpeechSessionConfig = {
  language: 'en-IN',
  continuous: true,
  interimResults: true,
  maxAlternatives: 1,
};

beforeEach(() => installEngine());
afterEach(() => uninstallEngine());

describe('WebSpeechProvider (Â§10 capability + Â§8 on-device)', () => {
  it('reports support when the engine exists, and keeps audio on-device', () => {
    const p = new WebSpeechProvider(() => 0);
    expect(isWebSpeechSupported()).toBe(true);
    expect(p.isSupported()).toBe(true);
    expect(p.keepsAudioOnDevice).toBe(true);
  });

  it('is unsupported and yields no session when no engine exists', () => {
    uninstallEngine();
    const onError = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    const session = p.start(config, { ...handlers(), onError });
    expect(p.isSupported()).toBe(false);
    expect(session).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unsupported' }));
  });

  it('configures the engine from the session config (language is not hard-coded)', () => {
    const p = new WebSpeechProvider(() => 0);
    p.start({ ...config, language: 'hi-IN' }, handlers());
    const rec = created[created.length - 1];
    expect(rec.lang).toBe('hi-IN');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.startCalls).toBe(1);
  });
});

describe('WebSpeechProvider result handling', () => {
  it('routes interim vs final and normalizes confidence (0 â†’ unavailable)', () => {
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    p.start(config, { ...handlers(), onInterim, onFinal });
    const rec = created[created.length - 1];

    rec.emit('hel', false, 0);
    expect(onInterim).toHaveBeenCalledWith(expect.objectContaining({ text: 'hel', isFinal: false, confidence: null }), 0);

    rec.emit('hello', true, 0.9);
    expect(onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello', isFinal: true, confidence: 0.9 }), 0);
  });

  it('ignores empty transcripts', () => {
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    p.start(config, { ...handlers(), onInterim, onFinal });
    created[created.length - 1].emit('   ', false);
    expect(onInterim).not.toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it('classifies an engine error into a friendly failure', () => {
    const onError = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    p.start(config, { ...handlers(), onError });
    created[created.length - 1].emitError('not-allowed');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'permission-denied' }));
  });
});

describe('WebSpeechProvider lifecycle / cleanup', () => {
  it('does not fire onEnd for a deliberate stop()', () => {
    const onEnd = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    const session = p.start(config, { ...handlers(), onEnd });
    const rec = created[created.length - 1];

    session!.stop(); // our stop() triggers rec.onend via the fake, but intentionally
    expect(rec.stopCalls).toBe(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('fires onEnd when the engine ends on its own (e.g. silence/timeout)', () => {
    const onEnd = vi.fn();
    const p = new WebSpeechProvider(() => 0);
    p.start(config, { ...handlers(), onEnd });
    const rec = created[created.length - 1];

    rec.onend?.(); // spontaneous engine end, we never called stop()
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
