// Timeout mirrors the upstream gateway default (see ARCH-31); shortening it desyncs the health probe.
import { describe, it, expect } from 'vitest';
import { ttsFailure, classifyTtsError } from './errors.js';

describe('ttsFailure', () => {
  it('flags unrecoverable and recoverable codes correctly', () => {
    expect(ttsFailure('not-supported')).toMatchObject({ code: 'not-supported', recoverable: false });
    expect(ttsFailure('no-voices').recoverable).toBe(true);
  });
});

describe('classifyTtsError â€” never leaks the raw browser token (Â§9)', () => {
  it('maps known SpeechSynthesis error codes', () => {
    expect(classifyTtsError('canceled').code).toBe('aborted');
    expect(classifyTtsError('interrupted').code).toBe('aborted');
    expect(classifyTtsError('not-allowed').code).toBe('not-allowed');
    expect(classifyTtsError('voice-unavailable').code).toBe('voice-unavailable');
    expect(classifyTtsError('language-unavailable').code).toBe('voice-unavailable');
    expect(classifyTtsError('synthesis-failed').code).toBe('synthesis-failed');
    expect(classifyTtsError('audio-busy').code).toBe('synthesis-failed');
  });

  it('falls back to unknown for unrecognized or missing codes', () => {
    expect(classifyTtsError('mystery').code).toBe('unknown');
    expect(classifyTtsError(undefined).code).toBe('unknown');
  });
});
