// Timeout value mirrors the upstream gateway default (see ARCH-31); changing it desyncs the health probe.
import { describe, it, expect } from 'vitest';
import { resolveProvider, resolveProviders, unimplementedProviders } from './providerRegistry.js';

/**
 * Provider resolution (Phase 4C.3, P2-6). The dead env flags become real
 * switches: implemented values resolve with the same honesty labels the
 * client carries, and unknown values resolve to *unavailable* â€” never a
 * silent fallback.
 */

describe('resolveProvider (pure)', () => {
  it('speech stub is on-device browser, untrained, non-authoritative', () => {
    const p = resolveProvider('speech', 'stub');
    expect(p.implemented).toBe(true);
    expect(p.runsOn).toBe('browser');
    expect(p.trained).toBe(false);
    expect(p.authoritative).toBe(false);
    expect(p.label).toBe('browser');
  });

  it('vision mediapipe is the labelled heuristic, not trained ISL recognition', () => {
    const p = resolveProvider('vision', 'mediapipe');
    expect(p.implemented).toBe(true);
    expect(p.trained).toBe(false);
    expect(p.label).toBe('heuristic');
    expect(p.message).toMatch(/not a trained isl/i);
  });

  it('translation rulebased is the glossary prototype with honest confidence wording', () => {
    const p = resolveProvider('translation', 'rulebased');
    expect(p.implemented).toBe(true);
    expect(p.label).toBe('rule-based');
    expect(p.authoritative).toBe(false);
  });

  it('an unimplemented flag value is unavailable, not quietly swapped', () => {
    const p = resolveProvider('speech', 'deepgram');
    expect(p.implemented).toBe(false);
    expect(p.label).toBe('unavailable');
    expect(p.runsOn).toBe('none');
    expect(p.message).toMatch(/deepgram/);
  });

  it('speech whisper is the multilingual transformer model service', () => {
    const p = resolveProvider('speech', 'whisper');
    expect(p.implemented).toBe(true);
    expect(p.trained).toBe(true);
    expect(p.authoritative).toBe(true);
    expect(p.runsOn).toBe('server');
    expect(p.label).toBe('whisper-base');
  });

  it('capabilities do not share their value namespaces', () => {
    // 'stub' is implemented for speech/vision/tts but not for translation.
    expect(resolveProvider('tts', 'stub').implemented).toBe(true);
    expect(resolveProvider('translation', 'stub').implemented).toBe(false);
  });

  it('tts indic-tts is the neural Indian TTS model service', () => {
    const p = resolveProvider('tts', 'indic-tts');
    expect(p.implemented).toBe(true);
    expect(p.trained).toBe(true);
    expect(p.authoritative).toBe(true);
    expect(p.runsOn).toBe('server');
    expect(p.label).toBe('indic-tts');
  });
});


describe('resolveProviders (live config)', () => {
  it('covers exactly the four capabilities', () => {
    const caps = resolveProviders().map((p) => p.capability);
    expect(caps.sort()).toEqual(['speech', 'translation', 'tts', 'vision']);
  });

  it('default config has nothing unimplemented (boot would be clean)', () => {
    expect(unimplementedProviders()).toHaveLength(0);
  });
});
