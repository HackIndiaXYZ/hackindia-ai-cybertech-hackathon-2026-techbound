/**
 * Word → sign → word integrity audit.
 *
 * The point of this file is the claim the app makes out loud: every glossed word
 * must (a) reach a clip the avatar can actually play, (b) play bone targets that
 * exist on the rig we ship, and (c) map back to the concept it came from, so
 * "words → signs" and "signs → words" are the same mapping in both directions.
 *
 * It also keeps the honesty machinery honest: the set of clips declared to have
 * authentic keyframes is compared against the real registry keys and against the
 * gesture registry's derived `realClip` flags, so neither can drift into
 * over-claiming a sign that has no animation behind it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { AUTHENTIC_CLIP_IDS, PLACEHOLDER_CLIPS, PLACEHOLDER_GESTURE_REGISTRY, isAuthenticClip } from './constants.js';
import { ISL_SIGN_REGISTRY } from './islSignRegistry.js';
import { SIGN_KIT_CLIP_IDS } from './signKitSigns.js';
import { GestureMapper } from './gestureMapper.js';
import { DEFAULT_GLOSSARY } from '../translation/glossary.js';
import { TranslationService } from '../translation/translationService.js';

/** Locate the shipped avatar GLB from wherever vitest happens to be running. */
function rigGlbPath(): string {
  // `join`, not `resolve`: resolve() makes this absolute against the current
  // directory, and an absolute path then overrides every base below — so the
  // audit only passed when the working directory already was apps/web.
  const relative = join('public', 'assets', 'avatars', 'missingwhisper-avatar.glb');
  for (const base of [process.cwd(), resolve('apps', 'web'), resolve('..', 'apps', 'web')]) {
    const candidate = resolve(base, relative);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('missingwhisper-avatar.glb not found for the rig audit');
}

/** Names of the joints the shipped avatar rig actually has. */
function shippedRigBones(): Set<string> {
  const bytes = readFileSync(rigGlbPath());
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf-8'));
  const joints = new Set<string>();
  for (const skin of gltf.skins ?? []) for (const index of skin.joints) joints.add(gltf.nodes?.[index]?.name);
  return joints;
}

/** Same normalisation the Babylon adapter uses to resolve a clip target at runtime. */
function normalizeBoneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mixamorig/, '');
}

/** clip id -> the concepts whose gesture ids resolve to that clip. */
function clipOwners(): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const entry of DEFAULT_GLOSSARY) {
    for (const gestureId of entry.gestureIds) {
      const descriptor = PLACEHOLDER_GESTURE_REGISTRY[gestureId];
      if (!descriptor) continue;
      const set = owners.get(descriptor.clipId) ?? new Set<string>();
      set.add(entry.conceptId);
      owners.set(descriptor.clipId, set);
    }
  }
  return owners;
}

interface SignChainRow {
  word: string;
  concept: string;
  gestureId: string;
  clipId: string;
  authentic: boolean;
  /** How this word reaches the avatar: a word sign, spelling, or dev motion. */
  route: 'word sign' | 'fingerspelled' | 'approximate motion';
}

/**
 * The chain the avatar actually performs, so this measures playback rather than
 * glossary intent: translate → GestureMapper.fromConcept → commands.
 */
function chainOf(sentence: string): SignChainRow[] {
  const service = new TranslationService({ clock: () => 0, now: () => '1970-01-01T00:00:00.000Z' });
  const mapper = new GestureMapper();
  const rows: SignChainRow[] = [];
  for (const concept of service.translate(sentence).representation.concepts) {
    for (const command of mapper.fromConcept(concept).commands) {
      const spelled = command.gestureId.startsWith('fingerspell-');
      rows.push({
        word: concept.sourceText,
        concept: concept.conceptId,
        gestureId: command.gestureId,
        clipId: command.animationClipId,
        authentic: !command.isPlaceholder,
        route: spelled ? 'fingerspelled' : command.isPlaceholder ? 'approximate motion' : 'word sign',
      });
    }
  }
  return rows;
}

/** Mirrors GestureMapper.lettersFor: the letters a concept is spelled with. */
function expectedLetters(concept: { sourceText: string; normalizedMeaning: string; conceptId: string }): string {
  const candidates = [
    concept.sourceText,
    concept.conceptId === 'unknown' ? '' : concept.conceptId,
    concept.normalizedMeaning,
  ];
  for (const candidate of candidates) {
    const letters = (candidate ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (letters.length > 0) return letters;
  }
  return '';
}

const AUTHENTIC_ONLY_SENTENCES = [
  'I thank you',
  'please thank you',
  'how are you',
  'good morning',
  'good night you',
  'he she it we they',
  'home time person',
  'hello alright',
  'आप कैसे हैं',
  'धन्यवाद',
];

describe('Sign library integrity (claims must match the keyframe data)', () => {
  it('declares exactly the clips that actually have keyframes', () => {
    expect([...AUTHENTIC_CLIP_IDS].sort()).toEqual(Object.keys(ISL_SIGN_REGISTRY).sort());
    for (const id of AUTHENTIC_CLIP_IDS) {
      expect(ISL_SIGN_REGISTRY[id].frames.length, `clip ${id} is declared authentic but has no frames`).toBeGreaterThan(0);
    }
  });

  it('derives every gesture descriptor realClip flag from the keyframe data', () => {
    for (const [id, descriptor] of Object.entries(PLACEHOLDER_GESTURE_REGISTRY)) {
      expect(descriptor.realClip, `descriptor ${id} disagrees with the clip data`).toBe(isAuthenticClip(descriptor.clipId));
    }
  });

  it('plays every authentic clip on the rig that actually ships', () => {
    const rig = new Set([...shippedRigBones()].map(normalizeBoneName));
    expect(rig.size).toBeGreaterThan(50);
    for (const [id, clip] of Object.entries(ISL_SIGN_REGISTRY)) {
      for (const target of clip.frames.flat()) {
        expect(target.property, `${id} animates a non-rotation property`).toBe('rotation');
        expect(['x', 'y', 'z']).toContain(target.axis);
        expect(Number.isFinite(target.value), `${id} has a non-finite rotation target`).toBe(true);
        expect(rig.has(normalizeBoneName(target.bone)), `${id} targets bone "${target.bone}", which the shipped rig does not have`).toBe(true);
      }
    }
  });

  it('keeps the Sign Kit port additive and clearly marked as word signs', () => {
    expect(SIGN_KIT_CLIP_IDS.length).toBeGreaterThanOrEqual(16);
    for (const id of SIGN_KIT_CLIP_IDS) {
      const clip = ISL_SIGN_REGISTRY[id];
      expect(clip, `${id} was not merged into the registry`).toBeDefined();
      expect(clip.isAlphabet).toBe(false);
      // Multi-stage signs: reach, hold, release. Playing only the ends loses the sign.
      expect(clip.frames.length, `${id} should carry more than one stage`).toBeGreaterThanOrEqual(3);
    }
  });

  it('maps every glossary gesture to a playable clip id', () => {
    for (const entry of DEFAULT_GLOSSARY) {
      for (const gestureId of entry.gestureIds) {
        const descriptor = PLACEHOLDER_GESTURE_REGISTRY[gestureId];
        expect(descriptor, `glossary concept ${entry.conceptId} uses unregistered gesture ${gestureId}`).toBeDefined();
        expect(PLACEHOLDER_CLIPS, `clip ${descriptor.clipId} is not advertised`).toContain(descriptor.clipId);
      }
    }
  });
});

describe('Word → sign → word round trip', () => {
  it('returns each signed word to the concept it came from', () => {
    const owners = clipOwners();
    const service = new TranslationService({ clock: () => 0, now: () => '1970-01-01T00:00:00.000Z' });
    const mapper = new GestureMapper();

    for (const sentence of [...AUTHENTIC_ONLY_SENTENCES, 'yesterday school I', 'water please give', 'मेरा नाम राहुल है']) {
      for (const concept of service.translate(sentence).representation.concepts) {
        const commands = mapper.fromConcept(concept).commands;
        const spelled = commands.filter((c) => c.gestureId.startsWith('fingerspell-'));
        if (spelled.length > 0) {
          // Spelling is reversible by construction: the handshapes must re-spell
          // exactly the word the concept came from.
          const letters = spelled.map((c) => c.gestureId.replace('fingerspell-', '')).join('');
          expect(letters, `spelling does not return "${concept.conceptId}"`).toBe(expectedLetters(concept));
          expect(spelled.every((c) => c.isPlaceholder === false), 'spelled handshapes must be real clips').toBe(true);
          continue;
        }
        for (const command of commands) {
          if (command.isPlaceholder) continue; // dev motion carries no ISL word claim to check
          const owningConcepts = owners.get(command.animationClipId);
          expect(owningConcepts?.has(concept.conceptId), `${command.animationClipId} does not map back to "${concept.conceptId}"`).toBe(true);
        }
      }
    }
  });

  it('signs every word of the authentic vocabulary with real keyframes', () => {
    for (const sentence of AUTHENTIC_ONLY_SENTENCES) {
      const rows = chainOf(sentence);
      expect(rows.length, `"${sentence}" produced no signs`).toBeGreaterThan(0);
      const unauthentic = rows.filter((row) => !row.authentic);
      expect(unauthentic, `"${sentence}" fell back to dev motion: ${JSON.stringify(unauthentic)}`).toEqual([]);
    }
  });

  it('never waves a generic pose when a word can be spelled with real handshapes', () => {
    for (const sentence of ['I go school yesterday', 'where is the hospital', 'my father is doctor', 'मुझे पानी चाहिए']) {
      const approximate = chainOf(sentence).filter((row) => row.route === 'approximate motion');
      expect(approximate, `"${sentence}" still used generic dev motion: ${JSON.stringify(approximate)}`).toEqual([]);
    }
  });

  it('reports word-by-word coverage so partial signing is visible, not hidden', () => {
    const demoSentences = [
      'I thank you',
      'how are you good morning',
      'please help me',
      'I go school yesterday',
      'where is the hospital',
      'my father is doctor',
      'आप कैसे हैं',
      'मुझे पानी चाहिए',
    ];

    const lines: string[] = [''];
    for (const sentence of demoSentences) {
      const rows = chainOf(sentence);
      const wordSigns = rows.filter((row) => row.route === 'word sign').length;
      const spelled = rows.filter((row) => row.route === 'fingerspelled').length;
      const approximate = rows.filter((row) => row.route === 'approximate motion').length;
      const pct = rows.length ? Math.round(((wordSigns + spelled) / rows.length) * 100) : 0;
      lines.push(
        `"${sentence}"  →  real handshapes ${wordSigns + spelled}/${rows.length} (${pct}%)  =  ${wordSigns} word signs + ${spelled} spelled letters + ${approximate} approximate`,
      );
      for (const row of rows) {
        lines.push(
          `   ${row.word.padEnd(12)} ${row.concept.padEnd(14)} ${row.clipId.padEnd(18)} ${row.route}`,
        );
      }
    }
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // The audit itself must never silently degrade: the core politeness + pronoun
    // vocabulary that the demo sentences rely on stays fully authentic, and no
    // demo sentence may fall back to a generic pose.
    expect(chainOf('I thank you').every((row) => row.authentic)).toBe(true);
    expect(chainOf('how are you good morning').every((row) => row.authentic)).toBe(true);
    for (const sentence of demoSentences) {
      expect(chainOf(sentence).some((row) => row.route === 'approximate motion'), `"${sentence}" used dev motion`).toBe(false);
    }
  });
});
