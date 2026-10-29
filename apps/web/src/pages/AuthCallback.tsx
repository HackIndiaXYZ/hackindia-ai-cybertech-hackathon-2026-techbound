import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../store/index.js';
import { completeGoogleSignIn } from '../store/authSlice.js';
import { readCallbackToken, scrubCallbackUrl } from '../lib/supabaseAuth.js';
import { Card, ErrorState, LoadingState } from '../components/ui/index.js';

/**
 * Supabase Google OAuth landing page.
 *
 * Google returns here with the provider session in the URL fragment. The token
 * is read once, traded for a first-party session via the API (which verifies it
 * against the project JWKS), then scrubbed from the address bar so a provider
 * token never lingers in history. Nothing here renders a form: on success the
 * user goes to the dashboard, on failure to /login with the reason.
 */
export function AuthCallback() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // StrictMode double-invokes effects in dev; the fragment can only be spent once.
  const spent = useRef(false);

  useEffect(() => {
    if (spent.current) return;
    spent.current = true;

    const token = readCallbackToken();
    if (!token) {
      scrubCallbackUrl();
      setError('No sign-in response was received from Google.');
      return;
    }
    scrubCallbackUrl();

    void (async () => {
      const result = await dispatch(completeGoogleSignIn(token));
      if (completeGoogleSignIn.fulfilled.match(result)) {
        navigate('/app/dashboard', { replace: true });
      } else {
        setError(typeof result.payload === 'string' ? result.payload : 'Google sign-in could not be completed.');
      }
    })();
  }, [dispatch, navigate]);

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold text-clay-ink">Finishing sign-in</h1>
        <p className="mt-1 text-clay-muted">Completing your Google sign-in.</p>
        <div className="mt-6">
          {error ? (
            <ErrorState title="Sign-in failed" message={error} />
          ) : (
            <LoadingState label="Verifying your Google account…" />
          )}
        </div>
        {error && (
          <p className="mt-4 text-center text-sm text-clay-muted">
            <Link to="/login" className="font-medium text-clay-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
