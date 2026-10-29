/**
 * Confidence is reported only when a provider actually measures it (§7).
 * We never invent a percentage.
 */

/**
 * Normalize a raw provider confidence to `0..1`, or null when it is not a
 * meaningful measurement. Browsers (notably the Web Speech API) report `0`
 * when they have *no* estimate — so `<= 0` is treated as "unavailable", not as
 * a genuine "0% sure". Out-of-range or non-numeric values are likewise null.
 */
export function readConfidence(raw: number | undefined | null): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  if (raw <= 0 || raw > 1) return null;
  return raw;
}

/** Display string that is explicit about missing confidence (§7 UI copy). */
export function formatConfidence(confidence: number | null): string {
  return confidence === null ? 'Confidence unavailable' : `${Math.round(confidence * 100)}%`;
}
