import { describe, it, expect } from 'vitest';
import reducer, {
  initialState,
  translationStarted,
  translationCompleted,
  translationFailed,
} from './translationSlice.js';
import { callStarted } from './callSlice.js';
import type { IslIntermediateRepresentation } from '@isl/shared-types';

const representation: IslIntermediateRepresentation = {
  sessionId: 's1',
  sourceLanguage: 'en',
  sourceText: 'hello water',
  concepts: [
    {
      conceptId: 'c1',
      sourceText: 'hello',
      normalizedMeaning: 'GREET',
      gestureIds: ['greet-1'],
      ordering: 0,
      confidence: 0.9,
      facialExpression: 'neutral',
      timingMs: 400,
    },
  ],
  overallConfidence: 0.9,
  fallbackUsed: false,
  unsupportedConcepts: ['water'],
  generatedAt: '2026-01-01T00:00:00.000Z',
};

/** In-call translation feed (plan §19 item 7): attributable, never fabricated. */
describe('translationSlice (§19)', () => {
  it('pairs started and completed by sourceTranscriptId', () => {
    let s = reducer(
      initialState,
      translationStarted({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: 'hello water' }),
    );
    expect(s.entries[0].representation).toBeNull();
    s = reducer(
      s,
      translationCompleted({ participantUserId: 'u1', sourceTranscriptId: 't1', representation }),
    );
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].representation?.concepts[0].normalizedMeaning).toBe('GREET');
  });

  it('keeps every row attributed to its speaker', () => {
    let s = reducer(initialState, translationStarted({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: 'a' }));
    s = reducer(s, translationStarted({ participantUserId: 'u2', sourceTranscriptId: 't2', sourceText: 'b' }));
    expect(s.entries.map((e) => e.participantUserId)).toEqual(['u1', 'u2']);
  });

  it('records a completed row that arrived without a started event', () => {
    const s = reducer(
      initialState,
      translationCompleted({ participantUserId: 'u3', sourceTranscriptId: 't9', representation }),
    );
    expect(s.entries[0].sourceText).toBe('');
    expect(s.entries[0].representation).not.toBeNull();
  });

  it('marks local translation failures visibly instead of leaving them pending', () => {
    let s = reducer(initialState, translationStarted({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: 'x' }));
    s = reducer(s, translationFailed('t1'));
    expect(s.entries[0].failed).toBe(true);
    expect(s.entries[0].representation).toBeNull();
  });

  it('bounds the feed to the most recent rows', () => {
    let s = initialState;
    for (let i = 0; i < 40; i++) {
      s = reducer(s, translationStarted({ participantUserId: 'u1', sourceTranscriptId: `t${i}`, sourceText: `line ${i}` }));
    }
    expect(s.entries).toHaveLength(30);
    expect(s.entries[0].sourceText).toBe('line 10');
  });

  it('resets with a fresh call', () => {
    let s = reducer(initialState, translationStarted({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: 'a' }));
    s = reducer(s, callStarted({ sessionId: 's2', selfUserId: 'u9' }));
    expect(s).toEqual(initialState);
  });
});
