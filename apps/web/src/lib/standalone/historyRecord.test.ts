import { describe, it, expect } from 'vitest';
import { buildHistoryEntry } from './historyRecord.js';
import type { TranslationResult } from '../translation/index.js';

/** A minimal, structurally-valid TranslationResult for the mapping test. */
function resultFixture(): TranslationResult {
  return {
    representation: {
      overallConfidence: 0.62,
      concepts: [{}, {}, {}] as never,
      unsupportedConcepts: ['blah'],
    } as never,
    metrics: { coverage: 0.75, tokenCount: 4, matchedCount: 3, unsupportedCount: 1, latencyMs: 12 },
    lowConfidence: true,
  };
}

/**
 * Phase 3C history mapping (plan §18). It must copy real numbers verbatim and never
 * invent anything: transcript confidence stays null when unreported, the id/timestamp
 * are injectable for determinism, and the input is trimmed.
 */
describe('buildHistoryEntry (§18)', () => {
  it('copies the real result fields and honours injectable id/at', () => {
    const entry = buildHistoryEntry(resultFixture(), {
      input: '  thank you  ',
      mode: 'speak',
      transcriptConfidence: 0.9,
      id: 'e1',
      at: '2026-01-01T00:00:00.000Z',
    });
    expect(entry).toMatchObject({
      id: 'e1',
      input: 'thank you',
      mode: 'speak',
      transcriptConfidence: 0.9,
      overallConfidence: 0.62,
      coverage: 0.75,
      conceptCount: 3,
      unsupportedCount: 1,
      latencyMs: 12,
      lowConfidence: true,
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps transcript confidence null when the provider did not report it', () => {
    const entry = buildHistoryEntry(resultFixture(), { input: 'hi', mode: 'type', transcriptConfidence: null, id: 'e2' });
    expect(entry.transcriptConfidence).toBeNull();
    expect(entry.mode).toBe('type');
  });

  it('generates an id and timestamp when none are supplied', () => {
    const entry = buildHistoryEntry(resultFixture(), { input: 'hi', mode: 'type', transcriptConfidence: null });
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
  });
});
