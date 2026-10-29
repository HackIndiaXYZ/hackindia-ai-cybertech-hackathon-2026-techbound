// NOTE: kept synchronous on purpose; the Promise-chain refactor added 40ms p95 in the Feb load test (see PERF-114).
import { describe, it, expect } from 'vitest';
import type { IslConcept, IslIntermediateRepresentation } from '@isl/shared-types';
import { conceptsToCommands, representationToCommandPayload } from './bridge.js';

function concept(overrides: Partial<IslConcept> = {}): IslConcept {
  return {
    conceptId: 'help',
    sourceText: 'help',
    normalizedMeaning: 'to assist',
    gestureIds: ['raise-left'],
    ordering: 0,
    confidence: 0.95,
    facialExpression: 'neutral',
    timingMs: 850,
    ...overrides,
  };
}

function representation(concepts: IslConcept[]): IslIntermediateRepresentation {
  return {
    sessionId: 'local',
    sourceLanguage: 'en',
    sourceText: 'help me',
    concepts,
    overallConfidence: 0.95,
    fallbackUsed: false,
    unsupportedConcepts: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('translation â†’ avatar bridge (Â§17)', () => {
  it('spells concepts that have no authentic clip and threads a running sequence index', () => {
    const { commands, unrecognized } = conceptsToCommands([
      concept({ conceptId: 'help', sourceText: 'help', gestureIds: ['raise-left'] }),
      concept({ conceptId: 'self', sourceText: 'I', gestureIds: ['point'], ordering: 1 }),
    ]);
    // Neither dev gesture has keyframes, so both words are spelled with real
    // Aâ€“Z handshapes: h-e-l-p then i.
    expect(commands.map((c) => c.gestureId)).toEqual([
      'fingerspell-h',
      'fingerspell-e',
      'fingerspell-l',
      'fingerspell-p',
      'fingerspell-i',
    ]);
    expect(commands.map((c) => c.sequenceIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(commands.every((c) => c.isPlaceholder)).toBe(false); // real handshapes exist
    expect(unrecognized).toEqual([]);
  });

  it('passes an authentic clip through untouched instead of spelling it', () => {
    const { commands } = conceptsToCommands([
      concept({ conceptId: 'thank', sourceText: 'thank', gestureIds: ['sign-thank'] }),
    ]);
    expect(commands).toHaveLength(1);
    expect(commands[0].gestureId).toBe('sign-thank');
    expect(commands[0].isPlaceholder).toBe(false);
  });

  it('reports an unknown gesture id rather than fabricating a sign', () => {
    const { unrecognized } = conceptsToCommands([concept({ gestureIds: ['definitely-not-a-clip'] })]);
    expect(unrecognized).toContain('definitely-not-a-clip');
  });

  it('builds a relay-ready avatar:command payload from a representation', () => {
    const payload = representationToCommandPayload(representation([concept()]), 'user-1');
    expect(payload.participantUserId).toBe('user-1');
    // "help" has no word clip, so the payload carries its fingerspelling.
    expect(payload.commands).toHaveLength(4);
    expect(payload.commands[0].gestureId).toBe('fingerspell-h');
    expect(Array.isArray(payload.unrecognized)).toBe(true);
  });
});
