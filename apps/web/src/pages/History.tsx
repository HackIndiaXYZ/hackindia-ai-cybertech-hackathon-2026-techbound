import { useEffect, useState } from 'react';
import type { CommunicationSession, Transcript } from '@isl/shared-types';
import { Button, Card, Badge, EmptyState, ErrorState, ListSkeleton } from '../components/ui/index.js';
import { fetchMySessions, fetchSessionTranscripts } from '../lib/directory.js';

/**
 * History (Phase 5.5, closes P0-2 acceptance). Lists the caller's persisted
 * sessions newest-first and, on demand, reads back the transcripts the server
 * stored for one of them. Every value comes from the API — this screen proves
 * that session content really landed, and never fabricates a row. It respects
 * §29 states: loading, error (with retry) and empty are all distinct.
 */

const TYPE_LABEL: Record<CommunicationSession['type'], string> = {
  one_to_one: 'One-to-one',
  group: 'Group',
  translator: 'Interpreter-assisted',
};

function statusTone(status: CommunicationSession['status']): 'success' | 'info' | 'neutral' {
  return status === 'active' ? 'success' : status === 'ended' ? 'neutral' : 'info';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function TranscriptDetail({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<Transcript[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSessionTranscripts(sessionId)
      .then((t) => live && setItems(t))
      .catch(() => live && setError('Could not load this session’s transcripts.'));
    return () => {
      live = false;
    };
  }, [sessionId]);

  if (error) {
    return (
      <p role="alert" className="mt-2 text-sm text-clay-danger">
        {error}
      </p>
    );
  }
  if (items === null) {
    return <p className="mt-2 text-sm text-clay-muted" role="status">Loading transcripts…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="mt-2 text-sm text-clay-muted">
        No transcripts were stored for this session. Content is only saved when storage consent is granted.
      </p>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((t) => (
        <li key={t.id} className="clay-inset rounded-clay p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-clay-muted">
            <Badge tone="info">{t.source}</Badge>
            <span>{t.language}</span>
            <span>· {formatDate(t.createdAt)}</span>
          </div>
          <p className="text-clay-ink">{t.text}</p>
        </li>
      ))}
    </ul>
  );
}

export function History() {
  const [sessions, setSessions] = useState<CommunicationSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setSessions(null);
    setError(null);
    fetchMySessions()
      .then((s) => live && setSessions(s))
      .catch(() => live && setError('Could not load your history.'));
    return () => {
      live = false;
    };
  }, [reload]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">History</h1>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
        </Card>
      ) : sessions === null ? (
        <Card>
          <ListSkeleton rows={3} />
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            title="No sessions yet"
            description="When you join or host a call, it will appear here along with any transcripts your consent allowed us to save."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {sessions.map((s) => {
            const open = openId === s.id;
            return (
              <li key={s.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-clay-ink">{TYPE_LABEL[s.type]} session</h2>
                      <p className="text-sm text-clay-muted">Started {formatDate(s.createdAt)}</p>
                    </div>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : s.id)}
                    >
                      {open ? 'Hide transcripts' : 'View transcripts'}
                    </Button>
                  </div>
                  {open && <TranscriptDetail sessionId={s.id} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
