import { useEffect, useState } from 'react';
import { Card, Badge, EmptyState, ErrorState, ListSkeleton } from '../components/ui/index.js';
import { fetchMyContacts, type ContactSummary } from '../lib/directory.js';

/**
 * Contacts (Phase 5.5). A derived people-directory: everyone the caller has
 * shared at least one session with, ranked server-side by how many sessions
 * they have in common. There is no separate address book in the product, so
 * this screen reads the real participation graph rather than inventing one.
 */
export function Contacts() {
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setContacts(null);
    setError(null);
    fetchMyContacts()
      .then((c) => live && setContacts(c))
      .catch(() => live && setError('Could not load your contacts.'));
    return () => {
      live = false;
    };
  }, [reload]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">Contacts</h1>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
        </Card>
      ) : contacts === null ? (
        <Card>
          <ListSkeleton rows={3} />
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <EmptyState
            title="No contacts yet"
            description="People you have been in a session with will be listed here."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {contacts.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center justify-between gap-4">
                <span className="text-lg font-medium text-clay-ink">{c.displayName}</span>
                <Badge tone="neutral">
                  {c.sharedSessions} shared {c.sharedSessions === 1 ? 'session' : 'sessions'}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
