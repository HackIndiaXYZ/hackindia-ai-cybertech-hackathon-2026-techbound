/** Tiny shared helpers for the translation module. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to 2 decimals for stable, comparable confidence numbers. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
