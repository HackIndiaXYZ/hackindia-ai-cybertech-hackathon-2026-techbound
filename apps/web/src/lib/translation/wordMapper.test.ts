import { describe, it, expect } from 'vitest';
import { buildGlossaryIndex, matchTokens } from './wordMapper.js';
import { DEFAULT_GLOSSARY } from './glossary.js';
import { tokenize } from './normalize.js';
import { TRANSLATION } from './constants.js';

const index = buildGlossaryIndex(DEFAULT_GLOSSARY);

describe('translation wordMapper (§16)', () => {
  it('matches an exact single form', () => {
    const [m] = matchTokens(tokenize('help'), index);
    expect(m.entry?.conceptId).toBe('help');
    expect(m.confidence).toBe(TRANSLATION.EXACT_FORM_CONFIDENCE);
    expect(m.span).toBe(1);
  });

  it('prefers the longest multiword phrase', () => {
    const matches = matchTokens(tokenize('thank you'), index);
    expect(matches).toHaveLength(1);
    expect(matches[0].entry?.conceptId).toBe('thank');
    expect(matches[0].span).toBe(2);
    expect(matches[0].confidence).toBe(TRANSLATION.PHRASE_CONFIDENCE);
  });

  it('marks an unsupported token with zero confidence and no entry', () => {
    const [m] = matchTokens(tokenize('xyzzy'), index);
    expect(m.entry).toBeNull();
    expect(m.confidence).toBe(0);
  });

  it('flags a romanized Hindi word as via-transliteration', () => {
    const [m] = matchTokens(tokenize('kya'), index);
    expect(m.entry?.conceptId).toBe('what');
    expect(m.viaTransliteration).toBe(true);
  });

  it('does not flag a pure English word as transliteration', () => {
    const [m] = matchTokens(tokenize('water'), index);
    expect(m.entry?.conceptId).toBe('water');
    expect(m.viaTransliteration).toBe(false);
  });

  it('matches a Devanagari form directly', () => {
    const [m] = matchTokens(tokenize('पानी'), index);
    expect(m.entry?.conceptId).toBe('water');
    expect(m.viaTransliteration).toBe(false);
  });
});
