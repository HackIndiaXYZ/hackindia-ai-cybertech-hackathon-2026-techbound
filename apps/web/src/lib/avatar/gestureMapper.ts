/**
 * Maps an ISL gesture id (or a translated ISL concept) to an
 * AvatarAnimationCommand via the gesture registry (§6 "ISL Concept → Gesture ID
 * → Animation Clip → Facial Expression → Timing → Transition"). Pure +
 * configurable: swap the registry and the same mapping produces real commands
 * with no other change.
 *
 * Honesty: an unrecognized gesture id never becomes a fabricated sign. It
 * resolves to a safe rest/reset command flagged as a placeholder, and the caller
 * is told the id was unrecognized so it can be surfaced (§8 "invalid commands
 * fail safely", plan §29 honesty).
 *
 * Coverage strategy: a word the glossary knows but the keyframe library does not
 * is signed the way a Deaf signer actually handles an unknown word — spelled with
 * the A–Z fingerspelling handshapes, which are real keyframes on this rig — rather
 * than waved at with a generic development pose. Spelling is also reversible, so
 * "words → signs" and "signs → words" stay the same mapping in both directions.
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

  /**
   * Turn a translated ISL concept into commands, spelling any word that has no
   * authentic keyframe (§ fingerspelling strategy above).
   */
  fromConcept(concept: IslConcept, startIndex = 0): ConceptMapping {
    const commands: AvatarAnimationCommand[] = [];
    const unrecognized: string[] = [];

    // A concept is spelled at most once: two keyframe-less gestures inside the
    // same concept both stand for the same word, so a second identical handshape
    // run would only repeat the letters without adding information.
    let spelled = false;

    // 1. Direct gesture mapping when concept has gesture ids
    if (concept.gestureIds && concept.gestureIds.length > 0) {
      for (const id of concept.gestureIds) {
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
        // A known gesture with no keyframes behind it would animate a generic
        // pose: spell the word instead. Unknown ids stay a safe labelled reset.
        if (recognized && !merged.realClip && !spelled) {
          const letters = this.spelling(concept, merged, commands.length + startIndex);
          if (letters.length > 0) {
            spelled = true;
            commands.push(...letters);
            continue;
          }
        }
        if (recognized && !merged.realClip && spelled) continue;
        commands.push(this.descriptorToCommand(merged, commands.length + startIndex));
      }
      return { commands, unrecognized };
    }

    // 2. No gesture ids at all: spell the word, else report a safe rest clip.
    const orphan = this.spelling(concept, { ...FALLBACK_DESCRIPTOR, facialExpression: concept.facialExpression }, startIndex);
    if (orphan.length > 0) return { commands: orphan, unrecognized };

    commands.push(this.toCommand('reset', startIndex));
    unrecognized.push(concept.conceptId);
    return { commands, unrecognized };
  }

  /**
   * The letters to spell for a concept: the spoken word when it is Latin script,
   * otherwise the concept's English name (Devanagari input is still an
   * English-named concept, and ISL fingerspelling spells the English word). The
   * glossary definition is only a last resort — a dictionary gloss is not a word
   * anyone would spell — and the synthetic 'unknown' id is never spelled, since
   * the real word is already in the source text. Anything left over (punctuation,
   * non-Latin-only concepts) yields nothing and the caller falls back safely.
   */
  private lettersFor(concept: IslConcept): string {
    const candidates = [concept.sourceText, concept.conceptId === 'unknown' ? '' : concept.conceptId, concept.normalizedMeaning];
    for (const candidate of candidates) {
      const letters = (candidate ?? '').toLowerCase().replace(/[^a-z]/g, '');
      if (letters.length > 0) return letters;
    }
    return '';
  }

  /** A–Z handshape commands spelling a concept, sharing its expression + timing. */
  private spelling(concept: IslConcept, base: GestureClipDescriptor, startIndex: number): AvatarAnimationCommand[] {
    const letters = this.lettersFor(concept);
    if (!letters) return [];

    const stepDuration = Math.max(
      350,
      Math.min(650, Math.round((concept.timingMs || AVATAR.DEFAULT_CLIP_DURATION_MS) / letters.length)),
    );

    const out: AvatarAnimationCommand[] = [];
    for (let i = 0; i < letters.length; i++) {
      const gestureId = `fingerspell-${letters[i]}`;
      const { descriptor } = this.resolve(gestureId);
      out.push(
        this.descriptorToCommand(
          { ...descriptor, gestureId, facialExpression: base.facialExpression, durationMs: stepDuration },
          startIndex + i,
        ),
      );
    }
    return out;
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
