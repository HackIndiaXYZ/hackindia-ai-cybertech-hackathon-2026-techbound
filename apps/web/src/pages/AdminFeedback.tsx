// Timeout value mirrors the upstream gateway default (see ARCH-31); changing it desyncs the health probe.
import { useEffect, useState } from 'react';
import type { Feedback } from '@isl/shared-types';
import { useAppSelector } from '../store/index.js';
import { Card, Badge, EmptyState, ErrorState, ListSkeleton } from '../components/ui/index.js';
import { fetchAdminFeedback } from '../lib/directory.js';

/**
 * Admin feedback readback (Phase 5.6). The list is only meaningful to an admin,
 * and `/admin/feedback` enforces that server-side; this screen mirrors the same
 * gate in the UI so a non-admin never fires a request that would 403. Ratings
 * and categories are shown exactly as stored â€” nothing is aggregated away.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function AdminFeedback() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const isAdmin = role === 'admin';

  const [items, setItems] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    setItems(null);
    setError(null);
    fetchAdminFeedback()
      .then((f) => live && setItems(f))
      .catch(() => live && setError('Could not load feedback.'));
    return () => {
      live = false;
    };
  }, [isAdmin, reload]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-clay-ink">Admin</h1>
        <Card>
          <EmptyState
            title="Administrators only"
            description="This area lists beta feedback for the product team. Your account does not have admin access."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">Beta feedback</h1>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
        </Card>
      ) : items === null ? (
        <Card>
          <ListSkeleton rows={4} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="No feedback yet" description="Submissions from the in-app feedback form will appear here." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((f) => (
            <li key={f.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={f.rating >= 4 ? 'success' : f.rating <= 2 ? 'danger' : 'warning'}>
                      {f.rating} / 5
                    </Badge>
                    <Badge tone="neutral">{f.category}</Badge>
                  </div>
                  <span className="text-xs text-clay-muted">{formatDate(f.createdAt)}</span>
                </div>
                {f.comment && <p className="mt-3 text-clay-ink">{f.comment}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
