import { describe, it, expect } from 'vitest';
import { TranslationService } from './translationService.js';

/** Deterministic clock: +100ms per call, so a non-empty translate measures 100ms. */
function makeService() {
  let t = 0;
  return new TranslationService({
    clock: () => (t += 100),
    now: () => '2026-01-01T00:00:00.000Z',
  });
}

const byId = (ids: string[]) => expect.arrayContaining(ids);

describe('TranslationService end-to-end (§16)', () => {
  it('maps a greeting + phrase into an ordered, confident representation', () => {
    const { representation, metrics, lowConfidence } = makeService().translate('hello thank you');
    expect(representation.sourceLanguage).toBe('en');
    expect(representation.concepts.map((c) => c.conceptId)).toEqual(['greet', 'thank']);
    expect(metrics.tokenCount).toBe(3);
    expect(metrics.matchedCount).toBe(2);
    expect(metrics.coverage).toBe(1);
    expect(metrics.latencyMs).toBe(100); // measured via the injected clock, not invented
    expect(lowConfidence).toBe(false);
    expect(representation.fallbackUsed).toBe(false);
  });

  it('reorders question words late and spreads a question marker', () => {
    const { representation } = makeService().translate('where is hospital');
    const concepts = representation.concepts;
    const last = concepts[concepts.length - 1];
    expect(last.conceptId).toBe('where');
    expect(last.facialExpression).toBe('question');
  });

  it('handles an unsupported word safely (listed, no invented gesture)', () => {
    const { representation, metrics } = makeService().translate('where is pharmacy');
    expect(representation.unsupportedConcepts).toContain('pharmacy');
    expect(representation.fallbackUsed).toBe(true);
    expect(metrics.unsupportedCount).toBe(1);
    const pharmacy = representation.concepts.find((c) => c.sourceText.toLowerCase() === 'pharmacy');
    expect(pharmacy?.gestureIds).toEqual([]); // fallback renders nothing, never a made-up sign
  });

  it('returns an empty, low-confidence representation for no input', () => {
    const { representation, metrics, lowConfidence } = makeService().translate('   ');
    expect(representation.concepts).toEqual([]);
    expect(metrics.tokenCount).toBe(0);
    expect(lowConfidence).toBe(true);
  });

  it('detects code-switched Devanagari + Latin input', () => {
    const { representation } = makeService().translate('thank you धन्यवाद');
    expect(representation.sourceLanguage).toBe('hi-en');
    expect(representation.concepts.map((c) => c.conceptId)).toEqual(byId(['thank']));
  });

  it('caps emitted concepts at maxConcepts', () => {
    const { representation } = makeService().translate('i want water now today good friend', { maxConcepts: 2 });
    expect(representation.concepts).toHaveLength(2);
  });
});
