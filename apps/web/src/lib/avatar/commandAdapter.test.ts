import { describe, it, expect } from 'vitest';
import { validateAnimationCommand, adaptAvatarCommandPayload } from './commandAdapter.js';
import { AVATAR } from './constants.js';
import type { AvatarAnimationCommand, AvatarCommandPayload } from '@isl/shared-types';

const valid: AvatarAnimationCommand = {
  gestureId: 'wave',
  animationClipId: 'wave',
  facialExpression: 'neutral',
  durationMs: 800,
  transition: 'crossfade',
  sequenceIndex: 0,
  isPlaceholder: true,
};

describe('validateAnimationCommand (§7 reuse existing contract, §8 fail safe)', () => {
  it('accepts and normalizes a valid command', () => {
    const r = validateAnimationCommand({ ...valid, gestureId: '  wave  ' });
    expect(r.ok).toBe(true);
    expect(r.command?.gestureId).toBe('wave');
  });

  it('clamps an out-of-range duration rather than rejecting the whole command', () => {
    const r = validateAnimationCommand({ ...valid, durationMs: 999_999 });
    expect(r.ok).toBe(true);
    expect(r.command?.durationMs).toBe(AVATAR.MAX_CLIP_DURATION_MS);
  });

  it.each([
    ['non-object', 42, 'not-an-object'],
    ['missing clip id', { ...valid, animationClipId: '' }, 'invalid-clip-id'],
    ['bad expression', { ...valid, facialExpression: 'anger' }, 'invalid-facial-expression'],
    ['bad transition', { ...valid, transition: 'teleport' }, 'invalid-transition'],
    ['non-positive duration', { ...valid, durationMs: 0 }, 'invalid-duration'],
    ['negative index', { ...valid, sequenceIndex: -1 }, 'invalid-sequence-index'],
    ['missing placeholder flag', { ...valid, isPlaceholder: 'yes' }, 'invalid-placeholder-flag'],
  ])('rejects %s', (_label, input, reason) => {
    const r = validateAnimationCommand(input);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
  });
});

describe('adaptAvatarCommandPayload (§7, ordering)', () => {
  it('partitions valid from invalid commands and orders by sequenceIndex', () => {
    const payload: AvatarCommandPayload = {
      participantUserId: 'user-1',
      commands: [
        { ...valid, gestureId: 'b', sequenceIndex: 1 },
        { ...valid, gestureId: 'bad', animationClipId: '' } as never,
        { ...valid, gestureId: 'a', sequenceIndex: 0 },
      ],
    };
    const adapted = adaptAvatarCommandPayload(payload);
    expect(adapted.commands.map((c) => c.gestureId)).toEqual(['a', 'b']);
    expect(adapted.rejected).toEqual([{ index: 1, reason: 'invalid-clip-id' }]);
    expect(adapted.participantUserId).toBe('user-1');
  });
});
