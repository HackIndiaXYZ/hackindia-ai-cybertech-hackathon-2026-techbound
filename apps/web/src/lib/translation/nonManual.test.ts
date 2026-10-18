import { describe, it, expect } from 'vitest';
import type { ConceptRole, DraftConcept } from './types.js';
import { applyNonManualMarkers } from './nonManual.js';

function draft(conceptId: string, role: ConceptRole): DraftConcept {
  return {
    concept: {
      conceptId,
      sourceText: conceptId,
      normalizedMeaning: conceptId,
      gestureIds: [],
      ordering: 0,
      confidence: 1,
      facialExpression: 'neutral',
      timingMs: 500,
    },
    role,
    isQuestionWord: role === 'question',
    isFallback: false,
  };
}

describe('translation non-manual markers (§16)', () => {
  it('marks fronted time/location as topic markers', () => {
    const drafts = [draft('today', 'time'), draft('i', 'pronoun')];
    applyNonManualMarkers(drafts, { isQuestion: false, hasNegation: false });
    expect(drafts[0].concept.facialExpression).toBe('topic_marker');
  });

  it('does not topicalize when there is only one concept', () => {
    const drafts = [draft('today', 'time')];
    applyNonManualMarkers(drafts, { isQuestion: false, hasNegation: false });
    expect(drafts[0].concept.facialExpression).toBe('neutral');
  });

  it('spreads a question marker to the final concept', () => {
    const drafts = [draft('you', 'pronoun'), draft('ok', 'adjective')];
    applyNonManualMarkers(drafts, { isQuestion: true, hasNegation: false });
    expect(drafts[drafts.length - 1].concept.facialExpression).toBe('question');
  });

  it('puts a negative marker on the main verb when negated', () => {
    const drafts = [draft('i', 'pronoun'), draft('go', 'verb')];
    applyNonManualMarkers(drafts, { isQuestion: false, hasNegation: true });
    expect(drafts[1].concept.facialExpression).toBe('negative');
  });
});
