import { describe, it, expect } from 'vitest';
import reducer, { addEntry, clearHistory } from './standaloneHistorySlice.js';
import type { HistoryEntry } from '../lib/standalone/index.js';

function entry(id: string): HistoryEntry {
  return {
    id,
    input: `phrase ${id}`,
    mode: 'speak',
    transcriptConfidence: null,
    overallConfidence: 0.5,
    coverage: 0.5,
    conceptCount: 1,
    unsupportedCount: 0,
    latencyMs: 5,
    lowConfidence: false,
    at: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * Phase 3C translation-history slice (plan §18). Guarantees under test: newest-first
 * ordering, a hard cap so an endless session cannot grow unbounded, and clear(). The
 * slice holds no persistence and no media — a plain, serializable UI list.
 */
describe('standaloneHistory slice (§18)', () => {
  it('starts empty', () => {
    expect(reducer(undefined, { type: '@@init' }).entries).toEqual([]);
  });

  it('prepends new entries (newest first)', () => {
    let s = reducer({ entries: [] }, addEntry(entry('a')));
    s = reducer(s, addEntry(entry('b')));
    expect(s.entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('caps history at 50 entries, dropping the oldest', () => {
    let s = { entries: [] as HistoryEntry[] };
    for (let i = 0; i < 60; i++) s = reducer(s, addEntry(entry(`id-${i}`)));
    expect(s.entries).toHaveLength(50);
    expect(s.entries[0].id).toBe('id-59');
    expect(s.entries.some((e) => e.id === 'id-0')).toBe(false);
  });

  it('clears history', () => {
    const s = reducer({ entries: [entry('a')] }, clearHistory());
    expect(s.entries).toEqual([]);
  });
});
