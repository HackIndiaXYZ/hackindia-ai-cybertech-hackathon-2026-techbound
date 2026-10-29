// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
import { Badge, Card } from '../ui/index.js';
import type { TranslationEntry } from '../../store/translationSlice.js';

interface TranslationPanelProps {
  entries: TranslationEntry[];
  /** Display name for a participant id; falls back to the id, never a guess. */
  nameOf: (userId: string) => string;
}

/**
 * Attributable in-call translation feed (plan Â§19 item 7). Every row names the
 * participant whose speech produced it, shows the source line and the ISL
 * concept sequence the glossary prototype produced â€” or an honest pending /
 * failed state. A standing notice keeps the prototype status visible (Â§37).
 */
export function TranslationPanel({ entries, nameOf }: TranslationPanelProps) {
  const latest = [...entries].reverse().slice(0, 8);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-clay-ink">In-call translation</h2>
        <Badge tone="warning" className="text-xs">Rule-based prototype</Badge>
      </div>

      {latest.length === 0 ? (
        <p className="text-sm text-clay-muted" role="status">
          No translations yet. Spoken lines are translated for every participant as they finish speaking.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Translation feed">
          {latest.map((e) => (
            <li key={e.sourceTranscriptId} className="clay-inset rounded-clay p-3">
              <p className="text-sm font-semibold text-clay-ink">{nameOf(e.participantUserId)}</p>
              <p className="mt-1 text-sm text-clay-muted">â€œ{e.sourceText || 'Source text not received'}â€</p>
              {e.failed ? (
                <p className="mt-1 text-sm font-medium text-clay-danger" role="status">Translation failed for this line.</p>
              ) : e.representation ? (
                <p className="mt-1 text-sm text-clay-ink">
                  <span className="font-semibold">ISL concepts: </span>
                  {e.representation.concepts.length > 0
                    ? e.representation.concepts.map((c) => c.normalizedMeaning).join(' â†’ ')
                    : 'No matched concepts'}
                  {e.representation.unsupportedConcepts.length > 0 && (
                    <span className="text-clay-warn"> Â· unsupported: {e.representation.unsupportedConcepts.join(', ')}</span>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-sm text-clay-warn" role="status">Translatingâ€¦</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-clay-muted">
        Outputs come from a curated gesture glossary, not a trained ISL model â€” treat them as
        sign-posted keywords, not full interpretations.
      </p>
    </Card>
  );
}
