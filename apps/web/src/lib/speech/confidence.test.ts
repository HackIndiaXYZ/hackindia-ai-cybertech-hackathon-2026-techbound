import { describe, it, expect } from 'vitest';
import { readConfidence, formatConfidence } from './confidence.js';

describe('readConfidence (§7 — never fabricate a percentage)', () => {
  it('passes through a real measured value', () => {
    expect(readConfidence(0.82)).toBe(0.82);
  });

  it('treats the browser default 0 as "no estimate", not a genuine 0%', () => {
    expect(readConfidence(0)).toBeNull();
  });

  it('treats missing, non-numeric and out-of-range as unavailable', () => {
    expect(readConfidence(undefined)).toBeNull();
    expect(readConfidence(null)).toBeNull();
    expect(readConfidence(Number.NaN)).toBeNull();
    expect(readConfidence(-0.3)).toBeNull();
    expect(readConfidence(1.4)).toBeNull();
  });

  it('accepts the 1.0 upper boundary', () => {
    expect(readConfidence(1)).toBe(1);
  });
});

describe('formatConfidence', () => {
  it('is explicit when confidence is unavailable', () => {
    expect(formatConfidence(null)).toBe('Confidence unavailable');
  });

  it('renders a rounded percentage when present', () => {
    expect(formatConfidence(0.8)).toBe('80%');
  });
});
