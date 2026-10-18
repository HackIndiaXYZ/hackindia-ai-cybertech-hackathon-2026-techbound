/** Small shared numeric helpers for the TTS module. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Round a millisecond delta for display; negative jitter clamps to 0. */
export function roundMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/** Round to 2 decimals (used for failure-rate display). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
