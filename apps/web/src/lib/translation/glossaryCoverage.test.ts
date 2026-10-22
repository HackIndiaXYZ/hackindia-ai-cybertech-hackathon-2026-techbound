import { describe, it, expect } from 'vitest';
import { DEFAULT_GLOSSARY, GLOSSARY_BY_CONCEPT } from './glossary.js';
import { buildGlossaryIndex, matchTokens } from './wordMapper.js';
import { tokenize } from './normalize.js';

describe('Glossary Coverage (Phase 4 — Speech-to-Gloss Lexicon Expansion)', () => {
  it('contains at least 70 curated bilingual concepts', () => {
    expect(DEFAULT_GLOSSARY.length).toBeGreaterThanOrEqual(70);
  });

  it('covers the entire 28-class ISL dynamic vocabulary from isl-engine', () => {
    const requiredConcepts = [
      'father', 'girl', 'child', 'doctor', 'dog',
      'school', 'hospital', 'park', 'market', 'city', 'street', 'home',
      'shirt', 'dress', 'hat', 'shoe',
      'black', 'yellow', 'happy', 'heavy',
      'monday', 'night', 'how-are-you', 'thank',
      'eat', 'drink', 'go', 'help', 'stand', 'walk'
    ];

    for (const concept of requiredConcepts) {
      expect(
        GLOSSARY_BY_CONCEPT[concept],
        `Expected concept "${concept}" to exist in GLOSSARY_BY_CONCEPT`,
      ).toBeDefined();
    }
  });

  it('resolves English and Hindi surface forms to correct ISL concepts via matchTokens', () => {
    const index = buildGlossaryIndex(DEFAULT_GLOSSARY);

    const testPairs: Array<{ phrase: string; expectedConcept: string }> = [
      { phrase: 'little girl', expectedConcept: 'girl' },
      { phrase: 'लड़की', expectedConcept: 'girl' },
      { phrase: 'young child', expectedConcept: 'child' },
      { phrase: 'बच्चा', expectedConcept: 'child' },
      { phrase: 'the dog', expectedConcept: 'dog' },
      { phrase: 'कुत्ता', expectedConcept: 'dog' },
      { phrase: 'went to park', expectedConcept: 'park' },
      { phrase: 'बगीचा', expectedConcept: 'park' },
      { phrase: 'in the city', expectedConcept: 'city' },
      { phrase: 'बाजार', expectedConcept: 'market' },
      { phrase: 'wearing a shirt', expectedConcept: 'shirt' },
      { phrase: 'red dress', expectedConcept: 'dress' },
      { phrase: 'heavy box', expectedConcept: 'heavy' },
      { phrase: 'भारी सामान', expectedConcept: 'heavy' },
      { phrase: 'walking slowly', expectedConcept: 'walk' },
      { phrase: 'standing there', expectedConcept: 'stand' },
    ];

    for (const { phrase, expectedConcept } of testPairs) {
      const tokens = tokenize(phrase);
      const matches = matchTokens(tokens, index);
      const found = matches.some((m) => m.entry?.conceptId === expectedConcept);
      expect(found, `Expected phrase "${phrase}" to map to concept "${expectedConcept}"`).toBe(true);
    }
  });
});
