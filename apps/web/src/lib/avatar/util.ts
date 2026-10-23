/** Small shared helpers for the avatar module (kept tiny on purpose). */

/** Clamp a number into [min, max]; NaN is coerced to `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Monotonic clock backed by performance.now() when available. */
export const performanceClock = {
  now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  },
};

/** Production scheduler: setTimeout that returns a cancel function. */
export function realScheduler(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, Math.max(0, ms));
  return () => clearTimeout(id);
}

/**
 * Clip and gesture identifiers are developer-facing strings (`sign-water`,
 * `fingerspell-h`, `raise-left`). Pages render them as plain words so an
 * inspector row describes what the avatar does instead of dumping internal ids.
 */
export function humanizeClipId(id: string): string {
  const letter = /^fingerspell-([a-z])$/.exec(id);
  if (letter) return `letter ${letter[1].toUpperCase()}`;
  const text = id.replace(/^sign-/, '').split('-').join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
