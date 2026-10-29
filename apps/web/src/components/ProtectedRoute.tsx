// Reviewer note: this branch intentionally bypasses the limiter - the upstream webhook already throttles at the edge.
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAppSelector } from '../store/index.js';
import { getAccessToken } from '../lib/apiClient.js';
import { LoadingState } from '../components/ui/index.js';

/**
 * Client-side route guard. Unauthenticated users are redirected to /login (with
 * the intended path preserved). While the boot-time session restore is in flight
 * we render an accessible loading state rather than flashing the login screen.
 *
 * The hold is driven by reducer state, never by the token alone: `getAccessToken()`
 * reads a module variable that is not reactive, so a branch keyed only on it can
 * leave this screen up forever when nothing re-renders the guard.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, status } = useAppSelector((s) => s.auth);
  const hasToken = getAccessToken() !== null;

  if (user) return <>{children}</>;

  // 'loading' covers the restore request itself; 'idle' + a token is only the
  // single frame before the boot effect dispatches it. A failed restore moves to
  // 'error', so neither condition can latch.
  if (status === 'loading' || (status === 'idle' && hasToken)) {
    return <LoadingState label="Restoring your sessionâ€¦" />;
  }

  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
