import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { Skeleton } from './Surfaces.js';

/** Standardized async UX states (§29). Every async surface uses one of these. */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-clay-edge border-t-clay-primary" aria-hidden="true" />
      <p className="text-clay-muted">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="clay-inset flex h-16 w-16 items-center justify-center rounded-clay text-2xl" aria-hidden="true">
        ⬦
      </div>
      <h3 className="text-lg font-semibold text-clay-ink">{title}</h3>
      {description && <p className="max-w-md text-clay-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" role="alert">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-clay-danger/15 text-2xl text-clay-danger" aria-hidden="true">
        !
      </div>
      <h3 className="text-lg font-semibold text-clay-ink">{title}</h3>
      {message && <p className="max-w-md text-clay-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
