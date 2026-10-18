/**
 * Avatar command adapter (§7, §8). Validates incoming AvatarAnimationCommand /
 * AvatarCommandPayload data against the *existing* shared-types contract — no
 * parallel schema — and rejects malformed commands safely instead of animating
 * garbage. This is the single seam Phase 3A will push real translated concepts
 * through, so keeping validation here means nothing below it changes later.
 *
 * Privacy note (§15): a command carries concept/animation instructions only.
 * The adapter never inspects or expects camera frames or audio; extra keys on a
 * payload are ignored, not forwarded.
 */
import type { AvatarAnimationCommand, AvatarCommandPayload, FacialExpression } from '@isl/shared-types';
import { AVATAR, FACIAL_EXPRESSIONS } from './constants.js';
import { clamp } from './util.js';

const VALID_EXPRESSIONS = new Set<string>(FACIAL_EXPRESSIONS);
const VALID_TRANSITIONS = new Set<AvatarAnimationCommand['transition']>(['blend', 'cut', 'crossfade']);

export interface CommandValidation {
  ok: boolean;
  /** Normalized command (duration clamped, fields trimmed) when valid. */
  command?: AvatarAnimationCommand;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validate + normalize one raw command. Never throws. */
export function validateAnimationCommand(raw: unknown): CommandValidation {
  if (!isRecord(raw)) return { ok: false, reason: 'not-an-object' };

  const { gestureId, animationClipId, facialExpression, durationMs, transition, sequenceIndex, isPlaceholder } = raw;

  if (typeof gestureId !== 'string' || gestureId.trim() === '') return { ok: false, reason: 'invalid-gesture-id' };
  if (typeof animationClipId !== 'string' || animationClipId.trim() === '') return { ok: false, reason: 'invalid-clip-id' };
  if (typeof facialExpression !== 'string' || !VALID_EXPRESSIONS.has(facialExpression)) {
    return { ok: false, reason: 'invalid-facial-expression' };
  }
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, reason: 'invalid-duration' };
  }
  if (typeof transition !== 'string' || !VALID_TRANSITIONS.has(transition as AvatarAnimationCommand['transition'])) {
    return { ok: false, reason: 'invalid-transition' };
  }
  if (typeof sequenceIndex !== 'number' || !Number.isFinite(sequenceIndex) || sequenceIndex < 0) {
    return { ok: false, reason: 'invalid-sequence-index' };
  }
  if (typeof isPlaceholder !== 'boolean') return { ok: false, reason: 'invalid-placeholder-flag' };

  const command: AvatarAnimationCommand = {
    gestureId: gestureId.trim(),
    animationClipId: animationClipId.trim(),
    facialExpression: facialExpression as FacialExpression,
    durationMs: clamp(Math.round(durationMs), AVATAR.MIN_CLIP_DURATION_MS, AVATAR.MAX_CLIP_DURATION_MS),
    transition: transition as AvatarAnimationCommand['transition'],
    sequenceIndex: Math.floor(sequenceIndex),
    isPlaceholder,
  };
  return { ok: true, command };
}

export interface AdaptedPayload {
  participantUserId: string;
  commands: AvatarAnimationCommand[];
  /** Rejected raw commands with the reason; surfaced for honest debugging. */
  rejected: Array<{ index: number; reason: string }>;
}

/** Validate a whole avatar:command payload, partitioning accepted/rejected. */
export function adaptAvatarCommandPayload(payload: AvatarCommandPayload): AdaptedPayload {
  const participantUserId = typeof payload.participantUserId === 'string' ? payload.participantUserId : '';
  const commands: AvatarAnimationCommand[] = [];
  const rejected: AdaptedPayload['rejected'] = [];
  const rawCommands = Array.isArray(payload.commands) ? payload.commands : [];

  rawCommands.forEach((raw, index) => {
    const result = validateAnimationCommand(raw);
    if (result.ok && result.command) commands.push(result.command);
    else rejected.push({ index, reason: result.reason ?? 'unknown' });
  });

  // Preserve intended ordering regardless of insertion order.
  commands.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  return { participantUserId, commands, rejected };
}
