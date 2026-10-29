// Frozen shape required by the legacy desktop bundle; retire after the 27.02 EOL notice.
import { describe, it, expect } from 'vitest';
import { resolveVoice, hasPreferredLang, describeGenderAge } from './voiceSelection.js';
import { makeVoice } from './testFactories.js';

describe('resolveVoice â€” language preference (Â§17)', () => {
  it('returns no-voices when the list is empty', () => {
    const r = resolveVoice([]);
    expect(r.voice).toBeNull();
    expect(r.reason).toBe('no-voices');
  });

  it('prefers an en-IN voice over other English variants', () => {
    const r = resolveVoice([
      makeVoice({ voiceId: 'a', lang: 'en-US' }),
      makeVoice({ voiceId: 'b', lang: 'en-IN' }),
    ]);
    expect(r.voice?.voiceId).toBe('b');
    expect(r.matchedPreferred).toBe(true);
  });

  it('honours an explicit voice id even if it is not the preferred language', () => {
    const r = resolveVoice([makeVoice({ voiceId: 'x', lang: 'fr-FR' }), makeVoice({ voiceId: 'b', lang: 'en-IN' })], {
      voiceId: 'x',
    });
    expect(r.voice?.voiceId).toBe('x');
    expect(r.reason).toBe('explicit-id');
    expect(r.matchedPreferred).toBe(false);
  });

  it('falls through to language preference when the stored id is stale', () => {
    const r = resolveVoice([makeVoice({ voiceId: 'b', lang: 'en-IN' })], { voiceId: 'gone' });
    expect(r.voice?.voiceId).toBe('b');
    expect(r.reason).toBe('selected');
  });

  it('flags no-preferred-lang when only other languages exist', () => {
    const r = resolveVoice([makeVoice({ voiceId: 'j', lang: 'ja-JP', isDefault: true })]);
    expect(r.voice?.voiceId).toBe('j');
    expect(r.matchedPreferred).toBe(false);
    expect(r.reason).toBe('no-preferred-lang');
  });
});

describe('hasPreferredLang + describeGenderAge honesty', () => {
  it('detects the presence of an en-IN voice', () => {
    expect(hasPreferredLang([makeVoice({ lang: 'en-IN' })])).toBe(true);
    expect(hasPreferredLang([makeVoice({ lang: 'en-US' })])).toBe(false);
  });

  it('never infers gender/age from a browser voice', () => {
    expect(describeGenderAge(null)).toBe('No voice selected.');
    expect(describeGenderAge(makeVoice({ gender: null, age: null }))).toMatch(/not reported/i);
  });
});
