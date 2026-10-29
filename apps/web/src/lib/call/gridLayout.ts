/**
 * Deterministic layout helpers for the group call grid (plan §19 items 1-3,
 * §30 clay surfaces). Pure functions with Tailwind class strings as the only
 * output format — no measurement, no DOM — so 2–5 participant arrangements
 * are unit-testable and stable across renders.
 */

/** Max participants per row on >=640px screens, by total tile count (incl. self). */
const COLUMN_RULES: ReadonlyArray<{ maxTiles: number; classes: string }> = [
  { maxTiles: 1, classes: 'grid-cols-1' },
  { maxTiles: 2, classes: 'grid-cols-1 sm:grid-cols-2' },
  { maxTiles: 4, classes: 'grid-cols-1 sm:grid-cols-2' },
  { maxTiles: 5, classes: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' },
];

/**
 * Grid classes for `totalTiles` tiles (local + remote). Counts beyond the
 * §19 group cap of 5 fall back to the three-column rule rather than silently
 * inventing a new layout.
 */
export function gridClassesFor(totalTiles: number): string {
  const count = Math.max(1, totalTiles);
  const rule = COLUMN_RULES.find((r) => count <= r.maxTiles) ?? COLUMN_RULES[COLUMN_RULES.length - 1];
  return `grid gap-3 ${rule.classes}`;
}

export interface TileOrderInput {
  /** Remote participant ids present in the call. */
  remoteUserIds: readonly string[];
  /** Ids currently flagged active (from the activeSpeaker slice). */
  speaking: Readonly<Record<string, boolean>>;
  /** Most recent active id, used as a sticky tiebreaker between flaps. */
  lastActiveUserId: string | null;
}

/**
 * Stable ordering for remote tiles: the most recent speaker leads, other
 * speaking tiles follow (id order), non-speaking tiles keep deterministic id
 * order — two clients with the same facts always render the same grid, and the
 * layout does not thrash on every VAD transition.
 */
export function orderedRemoteTiles(input: TileOrderInput): string[] {
  const sorted = [...input.remoteUserIds].sort((a, b) => a.localeCompare(b));
  const front = sorted.filter((id) => input.speaking[id] && id === input.lastActiveUserId);
  const active = sorted.filter((id) => input.speaking[id] && id !== input.lastActiveUserId);
  const idle = sorted.filter((id) => !input.speaking[id]);
  return [...front, ...active, ...idle];
}
