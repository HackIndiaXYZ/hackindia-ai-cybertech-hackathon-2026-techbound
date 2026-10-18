import { describe, it, expect } from 'vitest';
import type { ConceptRole, DraftConcept } from './types.js';
import { orderConcepts } from './ordering.js';

function draft(conceptId: string, role: ConceptRole): DraftConcept {
  return {
    concept: {
      conceptId,
      sourceText: conceptId,
      normalizedMeaning: conceptId,
      gestureIds: [],
      ordering: -1,
      confidence: 1,
      facialExpression: 'neutral',
      timingMs: 500,
    },
    role,
    isQuestionWord: role === 'question',
    isFallback: false,
  };
}

describe('translation ordering (§16 ISL-style ordering)', () => {
  it('fronts time and defers the verb, not English word order', () => {
    const ordered = orderConcepts([draft('i', 'pronoun'), draft('go', 'verb'), draft('tomorrow', 'time')]);
    expect(ordered.map((d) => d.concept.conceptId)).toEqual(['tomorrow', 'i', 'go']);
    expect(ordered.map((d) => d.concept.ordering)).toEqual([0, 1, 2]);
  });

  it('places a question word last', () => {
    const ordered = orderConcepts([draft('you', 'pronoun'), draft('where', 'question'), draft('help', 'verb')]);
    expect(ordered[ordered.length - 1].concept.conceptId).toBe('where');
  });

  it('is stable within the same role group', () => {
    const ordered = orderConcepts([draft('water', 'noun'), draft('food', 'noun')]);
    expect(ordered.map((d) => d.concept.conceptId)).toEqual(['water', 'food']);
  });

  it('orders Wh-questions correctly: "What is your name" -> [YOUR, NAME, WHAT]', () => {
    const ordered = orderConcepts([
      draft('what', 'question'),
      draft('your', 'pronoun'),
      draft('name', 'noun'),
    ]);
    expect(ordered.map((d) => d.concept.conceptId)).toEqual(['your', 'name', 'what']);
  });

  it('orders time-fronted SOV: "Yesterday I went to school" -> [YESTERDAY, ME, SCHOOL, GO]', () => {
    const ordered = orderConcepts([
      draft('yesterday', 'time'),
      draft('me', 'pronoun'),
      draft('go', 'verb'),
      draft('school', 'noun'),
    ]);
    expect(ordered.map((d) => d.concept.conceptId)).toEqual(['yesterday', 'me', 'school', 'go']);
  });

  it('orders negation after verb: "I do not know" -> [ME, KNOW, NOT]', () => {
    const ordered = orderConcepts([
      draft('me', 'pronoun'),
      draft('not', 'negation'),
      draft('know', 'verb'),
    ]);
    expect(ordered.map((d) => d.concept.conceptId)).toEqual(['me', 'know', 'not']);
  });
});
