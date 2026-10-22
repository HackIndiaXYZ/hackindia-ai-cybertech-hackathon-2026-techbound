import { describe, it, expect } from 'vitest';
import type { IslConcept } from '@isl/shared-types';
import { GestureMapper } from './gestureMapper.js';
import { AVATAR } from './constants.js';

function makeConcept(overrides: Partial<IslConcept> = {}): IslConcept {
  return {
    conceptId: 'c1',
    sourceText: 'hello',
    normalizedMeaning: 'greeting',
    gestureIds: ['wave', 'nonexistent-sign'],
    ordering: 0,
    confidence: 0.6,
    facialExpression: 'affirmative',
    timingMs: 500,
    ...overrides,
  };
}

describe('GestureMapper (§6 mapping, §8 honesty)', () => {
  const mapper = new GestureMapper();

  it('maps a registered gesture to a placeholder-flagged command', () => {
    const cmd = mapper.toCommand('wave', 2);
    expect(cmd.animationClipId).toBe('wave');
    expect(cmd.facialExpression).toBe('neutral');
    expect(cmd.transition).toBe('crossfade');
    expect(cmd.sequenceIndex).toBe(2);
    // No real ISL clip exists, so it must be flagged as a placeholder (§10).
    expect(cmd.isPlaceholder).toBe(true);
  });

  it('reports unknown gestures as unrecognized and falls back to a safe rest clip', () => {
    const { descriptor, recognized } = mapper.resolve('not-a-sign');
    expect(recognized).toBe(false);
    expect(descriptor.clipId).toBe('reset');
  });

  it('clamps malformed durations into the operational range', () => {
    const huge = new GestureMapper({
      giant: { gestureId: 'giant', clipId: 'wave', facialExpression: 'neutral', durationMs: 999_999, transition: 'blend', realClip: false },
    }).toCommand('giant');
    expect(huge.durationMs).toBe(AVATAR.MAX_CLIP_DURATION_MS);
  });

  it('maps a sequence with ascending ordering indices', () => {
    const cmds = mapper.toSequence(['wave', 'point', 'open']);
    expect(cmds.map((c) => c.sequenceIndex)).toEqual([0, 1, 2]);
  });

  it('flags real registered clips as non-placeholder only when the registry asserts it', () => {
    const m = new GestureMapper({
      'real-hello': { gestureId: 'real-hello', clipId: 'hello', facialExpression: 'affirmative', durationMs: 600, transition: 'blend', realClip: true },
    });
    expect(m.toCommand('real-hello').isPlaceholder).toBe(false);
  });

  it('derives commands from a Phase 3A concept, preserving its expression/timing and reporting unknown gestures', () => {
    const { commands, unrecognized } = mapper.fromConcept(makeConcept());
    expect(commands).toHaveLength(2);
    expect(commands[0].facialExpression).toBe('affirmative');
    expect(commands[0].durationMs).toBe(500);
    expect(unrecognized).toEqual(['nonexistent-sign']);
    // Even for the unknown id it stays a labelled placeholder, never a fake sign.
    expect(commands.every((c) => c.isPlaceholder)).toBe(true);
  });

  it('falls back to ISL fingerspelling letter-by-letter for unrecognized words (Phase 5)', () => {
    const unknownConcept: IslConcept = {
      conceptId: 'unknown',
      sourceText: 'delhi',
      normalizedMeaning: 'delhi',
      gestureIds: [],
      ordering: 0,
      confidence: 0.2,
      facialExpression: 'neutral',
      timingMs: 2500,
    };

    const { commands, unrecognized } = mapper.fromConcept(unknownConcept);
    expect(unrecognized).toHaveLength(0);
    expect(commands).toHaveLength(5);
    expect(commands.map((c) => c.gestureId)).toEqual([
      'fingerspell-d',
      'fingerspell-e',
      'fingerspell-l',
      'fingerspell-h',
      'fingerspell-i',
    ]);
    expect(commands.map((c) => c.animationClipId)).toEqual([
      'sign-d',
      'sign-e',
      'sign-l',
      'sign-h',
      'sign-i',
    ]);
    // The fingerspelling clips are real Mixamo bone keyframes from Signify
    expect(commands.every((c) => c.isPlaceholder === false)).toBe(true);
  });

  it('maps Phase 5 dynamic ISL signs (school, doctor, city, etc.) with realClip: true', () => {
    const schoolCmd = mapper.toCommand('sign-school');
    expect(schoolCmd.animationClipId).toBe('sign-school');
    expect(schoolCmd.isPlaceholder).toBe(false);

    const doctorCmd = mapper.toCommand('sign-doctor');
    expect(doctorCmd.animationClipId).toBe('sign-doctor');
    expect(doctorCmd.isPlaceholder).toBe(false);

    const cityCmd = mapper.toCommand('sign-city');
    expect(cityCmd.animationClipId).toBe('sign-city');
    expect(cityCmd.isPlaceholder).toBe(false);
  });
});
