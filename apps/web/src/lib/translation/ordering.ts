/**
 * ISL-specific concept ordering (plan §16: "ISL-specific ordering — not English
 * word order"). ISL commonly fronts time/location as a topic and places the verb
 * late, with question words at the very end. This is a deliberately COARSE,
 * role-based heuristic — it is NOT a claim to real ISL grammar parsing, only a
 * defensible re-grouping that shows the pipeline does not translate blindly
 * word-by-word. The grouping is applied via a stable sort so relative order
 * within a group is preserved and the result is deterministic.
 */
import type { ConceptRole, DraftConcept } from './types.js';

/** Lower rank signs earlier. Chosen to mirror common ISL topicalization + SOV lean. */
const ROLE_RANK: Record<ConceptRole, number> = {
  time: 0,
  place: 1,
  politeness: 2,
  pronoun: 3,
  noun: 4,
  other: 4,
  adjective: 5,
  feeling: 5,
  connector: 6,
  verb: 7,
  negation: 8,
  question: 9,
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
    if (rankA !== rankB) return rankA - rankB;
    return a.position - b.position; // stable within a role group
  });
  return indexed.map((entry, ordering) => {
    entry.draft.concept.ordering = ordering;
    return entry.draft;
  });
}
