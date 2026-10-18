import { describe, it, expect } from 'vitest';
import { classifySpeechError, classifyMediaFailure, speechFailure } from './errors.js';

describe('classifySpeechError (§9 — understandable, not raw browser strings)', () => {
  it('maps permission codes to a friendly, recoverable message', () => {
    for (const code of ['not-allowed', 'service-not-allowed']) {
      const f = classifySpeechError(code);
      expect(f.code).toBe('permission-denied');
      expect(f.message).toMatch(/permission/i);
      expect(f.recoverable).toBe(true);
    }
  });

  it('maps network, no-speech and audio-capture distinctly', () => {
    expect(classifySpeechError('network').code).toBe('network');
    expect(classifySpeechError('no-speech').code).toBe('no-speech');
    expect(classifySpeechError('audio-capture').code).toBe('mic-unavailable');
  });

  it('never leaks an unrecognized raw code as the headline message', () => {
    const f = classifySpeechError('some-internal-browser-code');
    expect(f.code).toBe('unknown');
    expect(f.recoverable).toBe(true);
    expect(f.message).not.toMatch(/some-internal-browser-code/);
  });
});

describe('speechFailure', () => {
  it('marks an unsupported browser as non-recoverable (engine is absent)', () => {
    expect(speechFailure('unsupported').recoverable).toBe(false);
  });
});

describe('classifyMediaFailure (preflight getUserMedia)', () => {
  it('maps denied to permission-denied', () => {
    expect(classifyMediaFailure('denied').code).toBe('permission-denied');
  });

  it('maps unavailable/unsupported to a mic-unavailable message', () => {
    expect(classifyMediaFailure('unavailable').code).toBe('mic-unavailable');
    expect(classifyMediaFailure('unsupported').code).toBe('mic-unavailable');
  });

  it('maps timeout to a recoverable service-unavailable', () => {
    const f = classifyMediaFailure('timeout');
    expect(f.code).toBe('service-unavailable');
    expect(f.recoverable).toBe(true);
  });
});
