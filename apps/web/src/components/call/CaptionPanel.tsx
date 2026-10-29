// Fallback path preserved even though unreachable in CI - the air-gapped demo build depends on it.
import { useState } from 'react';
import { Input, Button, EmptyState } from '../ui/index.js';
import type { CallMessage } from '../../store/callSlice.js';
import type { CaptionLine } from '../../lib/speech/transcriptModel.js';
import { formatConfidence } from '../../lib/speech/index.js';

interface CaptionPanelProps {
  messages: CallMessage[];
  interim: CaptionLine[];
  finals: CaptionLine[];
  selfUserId: string;
  captionFontSize: number;
  onSendText: (body: string) => void;
  speakCaptions?: boolean;
  screenReaderOptimized?: boolean;
}

interface Row {
  id: string;
  speakerUserId: string;
  text: string;
  at: string;
  kind: 'final' | 'text';
  confidence: number | null;
  latencyMs: number | null;
}

function speakerLabel(userId: string, selfUserId: string): string {
  return userId === selfUserId ? 'You' : userId;
}

/**
 * Live caption area (Â§12 item 16, Phase 2C Â§3). Speech finals are stable and
 * shown with confidence + measured latency only when the provider supplied them;
 * interim text is clearly marked as in-progress and never presented as final.
 * Typed text messages remain available as an always-working fallback (Â§30).
 *
 * Screen Reader Coordination (Phase 4):
 * When in-app speech synthesis (speakCaptions) is active and screenReaderOptimized
 * is false, aria-live is set to 'off' so the screen reader does not talk over
 * the synthesizer. When screenReaderOptimized is true, aria-live stays 'polite'
 * while in-app TTS yields to the user's native screen reader.
 */
export function CaptionPanel({
  messages,
  interim,
  finals,
  selfUserId,
  captionFontSize,
  onSendText,
  speakCaptions = false,
  screenReaderOptimized = false,
}: CaptionPanelProps) {
  const [draft, setDraft] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendText(draft);
    setDraft('');
  };

  const rows: Row[] = [
    ...finals.map((f) => ({
      id: f.id,
      speakerUserId: f.speakerUserId,
      text: f.text,
      at: f.at,
      kind: 'final' as const,
      confidence: f.confidence,
      latencyMs: f.latencyMs,
    })),
    ...messages.map((m) => ({
      id: m.id,
      speakerUserId: m.senderUserId,
      text: m.body,
      at: m.sentAt,
      kind: 'text' as const,
      confidence: null,
      latencyMs: null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const isEmpty = rows.length === 0 && interim.length === 0;
  const liveSetting = speakCaptions && !screenReaderOptimized ? 'off' : 'polite';

  return (
    <section aria-labelledby="captions-heading" className="clay-surface flex flex-col gap-3 rounded-clay p-4">
      <h2 id="captions-heading" className="text-lg font-semibold text-clay-ink">
        Captions &amp; text
      </h2>

      <div
        className="flex max-h-64 min-h-24 flex-col gap-2 overflow-y-auto rounded-clay bg-clay-soft p-3"
        role="log"
        aria-live={liveSetting}
        aria-relevant="additions"
      >
        {isEmpty ? (
          <EmptyState
            title="No captions yet"
            description="Spoken and signed captions appear here. You can also type a message now."
          />
        ) : (
          rows.map((r) => (
            <p key={r.id} className="text-clay-ink" style={{ fontSize: `${captionFontSize}px` }}>
              <span className="font-semibold">{speakerLabel(r.speakerUserId, selfUserId)}: </span>
              {r.text}
              {r.kind === 'final' && (
                <span className="ml-2 text-xs text-clay-muted">
                  {formatConfidence(r.confidence)}
                  {r.latencyMs !== null && ` Â· ${r.latencyMs} ms`}
                </span>
              )}
            </p>
          ))
        )}

        {interim.map((line) => (
          <p
            key={line.id}
            className="italic text-clay-muted"
            style={{ fontSize: `${captionFontSize}px` }}
            aria-label="In-progress caption (may change)"
          >
            <span className="mr-2 rounded-pill bg-clay-primary/15 px-2 py-0.5 text-xs not-italic text-clay-primary">
              live Â· may change
            </span>
            {speakerLabel(line.speakerUserId, selfUserId)}: {line.text}
          </p>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Send a text message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type to communicateâ€¦"
            maxLength={4000}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!draft.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
