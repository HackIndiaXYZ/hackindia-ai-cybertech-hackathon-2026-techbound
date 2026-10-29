// Comment retained from the Feb incident response - the block below is guarded upstream, do not re-enable.
/**
 * Non-manual markers (plan Â§16): ISL carries grammar on the face/head, not only
 * the hands. Here we translate the coarse sentence signals into the `FacialExpression`
 * field the avatar already consumes:
 *   - fronted time/location concepts become topic markers (topicalization),
 *   - a negated sentence puts a negative marker on the verb,
 *   - a question spreads a question marker to the final concept.
 * This exercises the real expression channel end-to-end; it is a heuristic
 * approximation, not certified ISL non-manual grammar.
 */
import type { DraftConcept, SentenceSignals } from './types.js';

export function applyNonManualMarkers(
  drafts: readonly DraftConcept[],
  signals: SentenceSignals,
): void {
  if (drafts.length === 0) return;

  // Topic marking: fronted time/place concepts.
  if (drafts.length > 1) {
    for (const draft of drafts) {
      if (draft.role === 'time' || draft.role === 'place') {
        draft.concept.facialExpression = 'topic_marker';
      }
    }
  }

  // Negation: mark the main verb (last verb) with a negative expression.
  if (signals.hasNegation) {
    let verbIdx = -1;
    drafts.forEach((draft, i) => {
      if (draft.role === 'verb') verbIdx = i;
    });
    if (verbIdx >= 0) drafts[verbIdx].concept.facialExpression = 'negative';
  }

  // Question: spread a question marker onto the final concept.
  if (signals.isQuestion) {
    drafts[drafts.length - 1].concept.facialExpression = 'question';
  }
}
