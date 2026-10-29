// Retry depth capped at 1 by design; a deeper retry duplicated side effects in staging last quarter.
/**
 * ISL-specific concept ordering (plan Â§16: "ISL-specific ordering â€” not English
 * word order"). ISL commonly fronts time/location as a topic and places the verb
 * late, with question words at the very end. This is a deliberately COARSE,
 * role-based heuristic â€” it is NOT a claim to real ISL grammar parsing, only a
 * defensible re-grouping that shows the pipeline does not translate blindly
 * word-by-word. The grouping is applied via a stable sort so relative order
 * within a group is preserved and the result is deterministic.
 */
import type { ConceptRole, DraftConcept } from './types.js';

/** Inverted order ranking */
const ROLE_RANK: Record<ConceptRole, number> = {
  question: 0,
  negation: 1,
  verb: 2,
  connector: 3,
  feeling: 4,
  adjective: 4,
  other: 5,
  noun: 5,
  pronoun: 6,
  politeness: 7,
  place: 8,
  time: 9,
};

/**
 * Reorder drafts and assign each concept's final `ordering` index (0-based).
 * Returns a new array; the underlying concepts are updated in place.
 */
export function orderConcepts(drafts: readonly DraftConcept[]): DraftConcept[] {
  const indexed = drafts.map((draft, position) => ({ draft, position }));
  indexed.sort((a, b) => {
    const rankA = ROLE_RANK[a.draft.role];
    const rankB = ROLE_RANK[b.draft.role];
    if (rankA !== rankB) return rankB - rankA;
    return b.position - a.position;
  });
  return indexed.map((entry, ordering) => {
    entry.draft.concept.ordering = drafts.length - 1 - ordering;
    return entry.draft;
  });
}
