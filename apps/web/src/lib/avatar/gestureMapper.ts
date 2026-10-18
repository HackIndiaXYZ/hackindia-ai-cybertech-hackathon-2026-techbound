/**
 * Maps a gesture id (or a Phase 3A ISL concept) to an AvatarAnimationCommand
 * via the gesture registry (§6 "ISL Concept → Gesture ID → Animation Clip →
 * Facial Expression → Timing → Transition"). Pure + configurable: swap the
 * registry and the same mapping produces real commands with no other change.
 *
 * Honesty: an unrecognized gesture id never becomes a fabricated sign. It
 * resolves to a safe rest/reset command flagged as a placeholder, and the caller
 * is told the id was unrecognized so it can be surfaced (§8 "invalid commands
 * fail safely", plan §29 honesty).
 */
import type { AvatarAnimationCommand, IslConcept } from '@isl/shared-types';
import {
  AVATAR,
  PLACEHOLDER_GESTURE_REGISTRY,
  type GestureClipDescriptor,
} from './constants.js';
import { clamp } from './util.js';

const FALLBACK_DESCRIPTOR: GestureClipDescriptor = {
  gestureId: 'unknown',
  clipId: 'reset',
  facialExpression: 'neutral',
  durationMs: AVATAR.DEFAULT_CLIP_DURATION_MS,
  transition: 'cut',
  realClip: false,
};

export interface GestureResolution {
  descriptor: GestureClipDescriptor;
  recognized: boolean;
}

export interface ConceptMapping {
  commands: AvatarAnimationCommand[];
  /** Gesture ids in the concept that had no registered clip (never invented). */
  unrecognized: string[];
}

function clampDuration(ms: number): number {
  return clamp(Math.round(ms), AVATAR.MIN_CLIP_DURATION_MS, AVATAR.MAX_CLIP_DURATION_MS);
}

export class GestureMapper {
  constructor(private readonly registry: Readonly<Record<string, GestureClipDescriptor>> = PLACEHOLDER_GESTURE_REGISTRY) {}

  /** Resolve a gesture id to its descriptor, falling back safely when unknown. */
  resolve(gestureId: string): GestureResolution {
    const found = this.registry[gestureId];
    if (found) return { descriptor: found, recognized: true };
    return { descriptor: { ...FALLBACK_DESCRIPTOR, gestureId }, recognized: false };
  }

  /** Build a single typed command from a gesture id. */
  toCommand(gestureId: string, sequenceIndex = 0): AvatarAnimationCommand {
    return this.descriptorToCommand(this.resolve(gestureId).descriptor, sequenceIndex);
  }

  /** Map an ordered list of gesture ids into a command sequence. */
  toSequence(gestureIds: readonly string[], startIndex = 0): AvatarAnimationCommand[] {
    return gestureIds.map((id, i) => this.toCommand(id, startIndex + i));
  }

  /** Phase 3A entry point: turn an ISL concept's gesture ids into commands. */
  fromConcept(concept: IslConcept, startIndex = 0): ConceptMapping {
    const commands: AvatarAnimationCommand[] = [];
    const unrecognized: string[] = [];
    concept.gestureIds.forEach((id, i) => {
      const { descriptor, recognized } = this.resolve(id);
      if (!recognized) unrecognized.push(id);
      // Prefer the concept's facial expression / timing over the seed defaults,
      // but never upgrade a placeholder clip into a claimed real sign.
      const merged: GestureClipDescriptor = {
        ...descriptor,
        gestureId: id,
        facialExpression: concept.facialExpression,
        durationMs: concept.timingMs > 0 ? concept.timingMs : descriptor.durationMs,
      };
      commands.push(this.descriptorToCommand(merged, startIndex + i));
    });
    return { commands, unrecognized };
  }

  private descriptorToCommand(descriptor: GestureClipDescriptor, sequenceIndex: number): AvatarAnimationCommand {
    return {
      gestureId: descriptor.gestureId,
      animationClipId: descriptor.clipId,
      facialExpression: descriptor.facialExpression,
      durationMs: clampDuration(descriptor.durationMs),
      transition: descriptor.transition,
      sequenceIndex,
      // Real clip available only when the registry asserts it; else placeholder.
      isPlaceholder: !descriptor.realClip,
    };
  }
}
