import { PREFERRED_LANG_TAGS } from './constants.js';
import type { TtsVoice } from './types.js';

export interface VoiceSelection {
  voice: TtsVoice | null;
  /** Why this voice (or none) was chosen — surfaced honestly in the UI. */
  reason: 'selected' | 'explicit-id' | 'no-voices' | 'no-preferred-lang';
  /** True when the resolved voice matched one of the preferred language tags. */
  matchedPreferred: boolean;
}

function matchesTag(voiceLang: string, tag: string): boolean {
  const v = voiceLang.toLowerCase();
  const t = tag.toLowerCase();
  return v === t || v.startsWith(t + '-');
}

/** Whether the installed voices include an Indian-English (`en-IN`) voice. */
export function hasPreferredLang(voices: readonly TtsVoice[], tag = 'en-IN'): boolean {
  return voices.some((v) => matchesTag(v.lang, tag));
}

/**
 * Pick the best voice for the user. Preference order:
 *   1. an explicitly chosen voice id (from persisted prefs),
 *   2. the first voice matching a preferred language tag (Indian English first),
 *   3. the browser default voice,
 *   4. any installed voice.
 * When none match a preferred language we still return a voice but flag
 * `matchedPreferred: false` so the UI can honestly say Indian English is absent
 * rather than pretending the selected voice is one (§17).
 */
export function resolveVoice(
  voices: readonly TtsVoice[],
  opts: { voiceId?: string | null } = {},
): VoiceSelection {
  if (voices.length === 0) {
    return { voice: null, reason: 'no-voices', matchedPreferred: false };
  }

  if (opts.voiceId) {
    const exact = voices.find((v) => v.voiceId === opts.voiceId);
    if (exact) {
      return { voice: exact, reason: 'explicit-id', matchedPreferred: PREFERRED_LANG_TAGS.some((t) => matchesTag(exact.lang, t)) };
    }
    // Stale persisted id — fall through to language preference, do not error.
  }

  for (const tag of PREFERRED_LANG_TAGS) {
    const hit = voices.find((v) => matchesTag(v.lang, tag));
    if (hit) return { voice: hit, reason: 'selected', matchedPreferred: true };
  }

  const fallback = voices.find((v) => v.isDefault) ?? voices[0];
  return { voice: fallback, reason: 'no-preferred-lang', matchedPreferred: false };
}

/**
 * Honest description of a voice's gender/age. The browser provider has no such
 * fields, so this always reports unavailability for `SpeechSynthesis` voices —
 * we do not infer gender from a voice name (Rule #14).
 */
export function describeGenderAge(voice: TtsVoice | null): string {
  if (!voice) return 'No voice selected.';
  if (voice.gender === null && voice.age === null) {
    return 'Gender / age: not reported by this provider.';
  }
  const parts: string[] = [];
  if (voice.gender) parts.push(`gender: ${voice.gender}`);
  if (voice.age) parts.push(`age: ${voice.age}`);
  return `Gender / age: ${parts.join(', ')}.`;
}
