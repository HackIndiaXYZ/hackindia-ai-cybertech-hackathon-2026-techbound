import { describe, it, expect } from 'vitest';
import {
  applyFinal,
  applyInterim,
  clearInterim,
  emptyCaptionState,
  interimLines,
  type CaptionLine,
  type CaptionState,
} from './transcriptModel.js';

function line(p: { speakerUserId: string; text: string; kind: 'interim' | 'final' } & Partial<CaptionLine>): CaptionLine {
  return {
    id: p.id ?? `${p.speakerUserId}:${p.kind}:${p.text}`,
    confidence: null,
    language: 'en-IN',
    latencyMs: null,
    at: '2026-01-01T00:00:00.000Z',
    ...p,
  } as CaptionLine;
}

describe('interim vs final (§3 — interim replaceable, finals stable)', () => {
  it('keeps only the newest interim per speaker, separate from finals', () => {
    let s: CaptionState = emptyCaptionState;
    s = applyInterim(s, line({ speakerUserId: 'a', text: 'he', kind: 'interim' }));
    s = applyInterim(s, line({ speakerUserId: 'a', text: 'hello', kind: 'interim' }));
    expect(interimLines(s).map((l) => l.text)).toEqual(['hello']);
    expect(s.finals).toHaveLength(0);
  });

  it('committing a final clears that speaker interim and appends a stable final', () => {
    let s = applyInterim(emptyCaptionState, line({ speakerUserId: 'a', text: 'hello', kind: 'interim' }));
    s = applyFinal(s, line({ speakerUserId: 'a', text: 'hello', kind: 'final', confidence: 0.9, latencyMs: 400 }));
    expect(s.interim['a']).toBeUndefined();
    expect(s.finals).toHaveLength(1);
    expect(s.finals[0].kind).toBe('final');
    expect(s.finals[0].confidence).toBe(0.9);
  });

  it('tracks multiple speakers independently', () => {
    let s = applyInterim(emptyCaptionState, line({ speakerUserId: 'a', text: 'x', kind: 'interim' }));
    s = applyInterim(s, line({ speakerUserId: 'b', text: 'y', kind: 'interim' }));
    expect(Object.keys(s.interim).sort()).toEqual(['a', 'b']);
  });
});

describe('duplicate final protection (§13)', () => {
  it('suppresses the identical immediately-preceding final from the same speaker', () => {
    let s = applyFinal(emptyCaptionState, line({ speakerUserId: 'a', text: 'hello', kind: 'final' }));
    s = applyFinal(s, line({ speakerUserId: 'a', text: 'hello', kind: 'final' }));
    expect(s.finals).toHaveLength(1);
  });

  it('allows the same text again when separated by another final', () => {
    let s = applyFinal(emptyCaptionState, line({ speakerUserId: 'a', text: 'hi', kind: 'final' }));
    s = applyFinal(s, line({ speakerUserId: 'b', text: 'yo', kind: 'final' }));
    s = applyFinal(s, line({ speakerUserId: 'a', text: 'hi', kind: 'final' }));
    expect(s.finals).toHaveLength(3);
  });

  it('still clears interim when a duplicate final is suppressed', () => {
    let s = applyFinal(emptyCaptionState, line({ speakerUserId: 'a', text: 'go', kind: 'final' }));
    s = applyInterim(s, line({ speakerUserId: 'a', text: 'go', kind: 'interim' }));
    s = applyFinal(s, line({ speakerUserId: 'a', text: 'go', kind: 'final' }));
    expect(s.finals).toHaveLength(1);
    expect(s.interim['a']).toBeUndefined();
  });
});

describe('clearInterim', () => {
  it('removes a speaker interim without touching committed finals', () => {
    let s = applyFinal(emptyCaptionState, line({ speakerUserId: 'a', text: 'x', kind: 'final' }));
    s = applyInterim(s, line({ speakerUserId: 'a', text: 'y', kind: 'interim' }));
    s = clearInterim(s, 'a');
    expect(s.interim['a']).toBeUndefined();
    expect(s.finals).toHaveLength(1);
  });
});
