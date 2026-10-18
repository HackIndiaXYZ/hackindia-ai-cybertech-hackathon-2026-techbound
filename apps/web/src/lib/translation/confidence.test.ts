import { describe, it, expect } from 'vitest';
import { summarizeConfidence } from './confidence.js';
import { makeEntry, makeMatch, tok } from './testFactories.js';

const entry = makeEntry();

describe('translation confidence (§16 low confidence visible)', () => {
  it('computes a span-weighted overall for a fully matched phrase', () => {
    const matches = [
      makeMatch({ token: tok('thank', 0), entry, span: 2, confidence: 0.97 }),
    ];
    const s = summarizeConfidence(matches, 2);
    expect(s.overallConfidence).toBe(0.97);
    expect(s.coverage).toBe(1);
    expect(s.lowConfidence).toBe(false);
  });

  it('pulls overall confidence down with unsupported tokens', () => {
    const matches = [
      makeMatch({ token: tok('water', 0), entry, span: 1, confidence: 0.95 }),
      makeMatch({ token: tok('xyz', 1), entry: null, span: 1, confidence: 0 }),
    ];
    const s = summarizeConfidence(matches, 2);
    // 0.95 + fallback 0.05 over 2 tokens.
    expect(s.overallConfidence).toBe(0.5);
    expect(s.coverage).toBe(0.5);
  });

  it('flags low confidence when coverage is thin', () => {
    const matches = [
      makeMatch({ token: tok('water', 0), entry, span: 1, confidence: 0.95 }),
      makeMatch({ token: tok('a', 1), entry: null, span: 1, confidence: 0 }),
      makeMatch({ token: tok('b', 2), entry: null, span: 1, confidence: 0 }),
    ];
    const s = summarizeConfidence(matches, 3);
    expect(s.coverage).toBeLessThan(0.34);
    expect(s.lowConfidence).toBe(true);
  });

  it('returns a low-confidence empty summary for no tokens', () => {
    const s = summarizeConfidence([], 0);
    expect(s.overallConfidence).toBe(0);
    expect(s.coverage).toBe(0);
    expect(s.lowConfidence).toBe(true);
  });
});
