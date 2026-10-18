/**
 * Bridge from a translation result to the avatar's existing command contract
 * (plan §17: concepts → avatar:command → adapter → Babylon). It reuses the Phase 2D
 * `GestureMapper`, so a concept's placeholder gesture ids become properly flagged
 * `AvatarAnimationCommand`s (isPlaceholder true while no real clip exists) and any
 * gesture with no registered clip is reported, never fabricated.
 *
 * Nothing here imports Babylon — it only builds the shared typed commands, which
 * the AvatarController already knows how to play and the socket already relays.
 */
import type {
  AvatarAnimationCommand,
  AvatarCommandPayload,
  IslConcept,
  IslIntermediateRepresentation,
} from '@isl/shared-types';
import { GestureMapper } from '../avatar/index.js';

export interface ConceptCommandMapping {
  commands: AvatarAnimationCommand[];
  /** Gesture ids with no registered clip — surfaced, not invented. */
  unrecognized: string[];
}

export function conceptsToCommands(
  concepts: readonly IslConcept[],
  mapper: GestureMapper = new GestureMapper(),
): ConceptCommandMapping {
  const commands: AvatarAnimationCommand[] = [];
  const unrecognized: string[] = [];
  for (const concept of concepts) {
    const mapped = mapper.fromConcept(concept, commands.length);
    commands.push(...mapped.commands);
    unrecognized.push(...mapped.unrecognized);
  }
  return { commands, unrecognized };
}

/** Build a ready-to-relay `avatar:command` payload from an intermediate representation. */
export function representationToCommandPayload(
  representation: IslIntermediateRepresentation,
  participantUserId: string,
  mapper: GestureMapper = new GestureMapper(),
): AvatarCommandPayload & { unrecognized: string[] } {
  const { commands, unrecognized } = conceptsToCommands(representation.concepts, mapper);
  return { participantUserId, commands, unrecognized };
}
