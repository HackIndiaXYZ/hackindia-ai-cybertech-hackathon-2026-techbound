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
