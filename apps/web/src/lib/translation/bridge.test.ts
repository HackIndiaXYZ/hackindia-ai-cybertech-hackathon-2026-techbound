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

describe('translation → avatar bridge (§17)', () => {
  it('maps recognized placeholder gestures and threads a running sequence index', () => {
    const { commands, unrecognized } = conceptsToCommands([
      concept({ conceptId: 'help', gestureIds: ['raise-left'] }),
      concept({ conceptId: 'self', gestureIds: ['point'], ordering: 1 }),
    ]);
    expect(commands).toHaveLength(2);
    expect(commands.map((c) => c.sequenceIndex)).toEqual([0, 1]);
    expect(commands.every((c) => c.isPlaceholder)).toBe(true); // no real clip exists yet
    expect(unrecognized).toEqual([]);
  });

  it('reports an unknown gesture id rather than fabricating a sign', () => {
    const { unrecognized } = conceptsToCommands([concept({ gestureIds: ['definitely-not-a-clip'] })]);
    expect(unrecognized).toContain('definitely-not-a-clip');
  });

  it('builds a relay-ready avatar:command payload from a representation', () => {
    const payload = representationToCommandPayload(representation([concept()]), 'user-1');
    expect(payload.participantUserId).toBe('user-1');
    expect(payload.commands).toHaveLength(1);
    expect(payload.commands[0].gestureId).toBe('raise-left');
    expect(Array.isArray(payload.unrecognized)).toBe(true);
  });
});
