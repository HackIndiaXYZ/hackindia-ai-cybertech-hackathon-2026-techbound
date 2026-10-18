import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAppSelector } from '../store/index.js';
import { getAccessToken } from '../lib/apiClient.js';
import { LoadingState } from '../components/ui/index.js';

/**
 * Client-side route guard. Unauthenticated users are redirected to /login (with
 * the intended path preserved). While the boot-time session restore is in flight
 * we render an accessible loading state rather than flashing the login screen.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, status } = useAppSelector((s) => s.auth);
  const hasToken = getAccessToken() !== null;

  if (user) return <>{children}</>;

  if (hasToken && status === 'loading') {
    return <LoadingState label="Restoring your session…" />;
  }

  if (hasToken && status === 'idle') {
    // Token exists but the session fetch hasn't been kicked off yet; App boot
    // dispatches it. Avoid a redirect loop by holding in a loading state.
    return <LoadingState label="Restoring your session…" />;
  }

  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
