import { TTS } from './constants.js';
import type { TtsProsody } from './types.js';
import { clamp } from './util.js';

export const DEFAULT_PROSODY: TtsProsody = {
  rate: TTS.DEFAULT_RATE,
  pitch: TTS.DEFAULT_PITCH,
  volume: TTS.DEFAULT_VOLUME,
};

/** Clamp each axis into the provider-safe range. */
export function clampProsody(prosody: TtsProsody): TtsProsody {
  return {
    rate: clamp(prosody.rate, TTS.MIN_RATE, TTS.MAX_RATE),
    pitch: clamp(prosody.pitch, TTS.MIN_PITCH, TTS.MAX_PITCH),
    volume: clamp(prosody.volume, TTS.MIN_VOLUME, TTS.MAX_VOLUME),
  };
}

/** Merge a partial request over a base profile, then clamp. */
export function resolveProsody(
  requested: Partial<TtsProsody> | undefined,
  base: TtsProsody = DEFAULT_PROSODY,
): TtsProsody {
  return clampProsody({ ...base, ...requested });
}

/**
 * The loudness actually sent to the provider. When muted we still go through the
 * full playback path at volume 0 so state, latency and failure metrics stay
 * truthful — muting never fakes a "played" result (§17).
 */
export function effectiveVolume(prosody: TtsProsody, muted: boolean): number {
  return muted ? 0 : clamp(prosody.volume, TTS.MIN_VOLUME, TTS.MAX_VOLUME);
}
