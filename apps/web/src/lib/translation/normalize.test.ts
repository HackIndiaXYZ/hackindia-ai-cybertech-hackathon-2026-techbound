import { describe, it, expect } from 'vitest';
import { tokenize, detectLanguage, detectSignals } from './normalize.js';

describe('translation normalize (§16)', () => {
  it('tokenizes, lowercases surfaces and strips punctuation', () => {
    const tokens = tokenize('Hello, World!');
    expect(tokens.map((t) => t.surface)).toEqual(['hello', 'world']);
    expect(tokens[0].raw).toBe('Hello');
    expect(tokens[0].index).toBe(0);
  });

  it('returns no tokens for empty/whitespace input', () => {
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });

  it('detects script per token', () => {
    const tokens = tokenize('namaste धन्यवाद 123');
    expect(tokens.map((t) => t.script)).toEqual(['latin', 'devanagari', 'other']);
  });

  it('detects language from the scripts present', () => {
    expect(detectLanguage(tokenize('thank you'))).toBe('en');
    expect(detectLanguage(tokenize('धन्यवाद'))).toBe('hi');
    expect(detectLanguage(tokenize('thank you धन्यवाद'))).toBe('hi-en');
  });

  it('flags questions via punctuation or a WH-word', () => {
    expect(detectSignals('how are you', tokenize('how are you')).isQuestion).toBe(true);
    expect(detectSignals('you ok?', tokenize('you ok')).isQuestion).toBe(true);
    expect(detectSignals('i am fine', tokenize('i am fine')).isQuestion).toBe(false);
  });

  it('flags negation via English or Hindi cues', () => {
    expect(detectSignals('i do not know', tokenize('i do not know')).hasNegation).toBe(true);
    expect(detectSignals('मैं नहीं जानता', tokenize('मैं नहीं जानता')).hasNegation).toBe(true);
    expect(detectSignals('i know', tokenize('i know')).hasNegation).toBe(false);
  });
});
