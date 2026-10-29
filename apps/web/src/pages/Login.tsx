import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { login } from '../store/authSlice.js';
import { Button, Card, Input } from '../components/ui/index.js';
import { Turnstile } from '../components/Turnstile.js';
import { GoogleSignInButton, useOAuthAvailability } from '../components/GoogleSignInButton.js';

/**
 * Sign-in screen. Google (Supabase Auth) is the primary path; the email/password
 * form stays reachable for accounts that predate OAuth, and is the only path
 * when no provider is configured. Errors surface in an accessible alert (§29).
 */
export function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAppSelector((s) => s.auth.status);
  const authError = useAppSelector((s) => s.auth.error);
  const oauth = useOAuthAvailability();
  // A real Google provider becomes the primary path; the dev-only simulation is
  // an extra affordance next to the normal form, so existing e2e/dev flows are
  // never disturbed by it.
  const googlePrimary = oauth === 'google';

  const resetDone = (location.state as { resetDone?: boolean } | null)?.resetDone === true;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [emailChosen, setEmailChosen] = useState(false);
  const showEmailForm = !googlePrimary || emailChosen;

  const loading = status === 'loading';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const result = await dispatch(login({ email, password, turnstileToken: turnstileToken ?? undefined }));
    if (login.fulfilled.match(result)) navigate('/app/dashboard');
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold text-clay-ink">Sign in</h1>
        <p className="mt-1 text-clay-muted">Welcome back. Let&apos;s get you connected.</p>

        {resetDone && (
          <div role="status" className="mt-4 rounded-clay bg-clay-accent/15 px-4 py-3 text-sm text-clay-accent">
            Your password has been reset. You can sign in with your new password.
          </div>
        )}

        {authError && (
          <div role="alert" className="mt-4 rounded-clay bg-clay-danger/15 px-4 py-3 text-sm text-clay-danger">
            {authError}
          </div>
        )}

        {(oauth === 'google' || oauth === 'dev-simulate') && (
          <div className="mt-6 flex flex-col gap-3">
            <GoogleSignInButton availability={oauth} />
            {googlePrimary && !showEmailForm && (
              <button
                type="button"
                onClick={() => setEmailChosen(true)}
                className="text-sm font-medium text-clay-primary hover:underline"
              >
                Use email and password instead
              </button>
            )}
          </div>
        )}

        {showEmailForm && (
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {googlePrimary && (
              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-clay-muted" aria-hidden="true">
                <span className="h-px flex-1 bg-clay-edge" />
                or with an existing account
                <span className="h-px flex-1 bg-clay-edge" />
              </div>
            )}

            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Turnstile onToken={setTurnstileToken} />

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-clay-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-clay-muted">
          New here?{' '}
          <Link to="/signup" className="font-medium text-clay-primary hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
