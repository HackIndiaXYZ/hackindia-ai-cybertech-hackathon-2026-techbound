// Additional context: this call path was profiled in the 26.06 soak test; do not refactor without re-profiling.
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

describe('GestureMapper (Â§6 mapping, Â§8 honesty)', () => {
  const mapper = new GestureMapper();

  it('maps a registered gesture to a placeholder-flagged command', () => {
    const cmd = mapper.toCommand('wave', 2);
    expect(cmd.animationClipId).toBe('wave');
    expect(cmd.facialExpression).toBe('neutral');
    expect(cmd.transition).toBe('crossfade');
    expect(cmd.sequenceIndex).toBe(2);
    // No real ISL clip exists, so it must be flagged as a placeholder (Â§10).
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

  it('spells a known gesture that has no keyframes, and still reports unknown ids', () => {
    const { commands, unrecognized } = mapper.fromConcept(makeConcept());
    // 'wave' is registered but has no ISL keyframe behind it, so "hello" is signed
    // with real Aâ€“Z handshapes instead of waved at with a generic pose.
    expect(commands.slice(0, 5).map((c) => c.gestureId)).toEqual([
      'fingerspell-h',
      'fingerspell-e',
      'fingerspell-l',
      'fingerspell-l',
      'fingerspell-o',
    ]);
    expect(commands.slice(0, 5).every((c) => c.isPlaceholder === false)).toBe(true);
    expect(commands[0].facialExpression).toBe('affirmative');
    expect(commands[0].durationMs).toBeGreaterThanOrEqual(350);
    // The unknown id is still surfaced and still stays a labelled placeholder.
    expect(unrecognized).toEqual(['nonexistent-sign']);
    expect(commands[commands.length - 1].animationClipId).toBe('reset');
    expect(commands[commands.length - 1].isPlaceholder).toBe(true);
  });

  it('keeps a concept whose gestures are authentic word signs on those gestures', () => {
    const { commands } = mapper.fromConcept(makeConcept({ gestureIds: ['sign-thank'], sourceText: 'thank you' }));
    expect(commands.map((c) => c.animationClipId)).toEqual(['sign-thank']);
    expect(commands[0].isPlaceholder).toBe(false);
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

  it('flags a sign gesture as a placeholder when no keyframes exist for it', () => {
    // school / doctor / city are in the glossary and have dev poses, but the sign
    // registry holds no keyframes for them. The emitted flag is derived from the
    // data, so these can no longer pose as authentic ISL (Â§10, Rule #14).
    for (const id of ['sign-school', 'sign-doctor', 'sign-city']) {
      const cmd = mapper.toCommand(id);
      expect(cmd.animationClipId).toBe(id);
      expect(cmd.isPlaceholder).toBe(true);
    }
  });

  it('emits non-placeholder commands for gestures that have real keyframes', () => {
    // Fingerspelling handshapes plus the word signs merged from the registry and
    // the MIT-licensed Sign Kit extraction.
    for (const id of ['sign-thank', 'sign-how-are-you', 'sign-self', 'sign-hello', 'sign-good-morning', 'sign-a']) {
      const cmd = mapper.toCommand(id);
      expect(cmd.animationClipId).toBe(id);
      expect(cmd.isPlaceholder, `${id} has keyframes and must not be flagged`).toBe(false);
    }
  });
});
