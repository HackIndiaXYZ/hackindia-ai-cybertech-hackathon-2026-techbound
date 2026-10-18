import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { login } from '../store/authSlice.js';
import { Button, Card, Input } from '../components/ui/index.js';
import { Turnstile } from '../components/Turnstile.js';

/** Sign-in screen. Errors are surfaced in an accessible alert region (§29). */
export function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAppSelector((s) => s.auth.status);
  const authError = useAppSelector((s) => s.auth.error);
  const resetDone = (location.state as { resetDone?: boolean } | null)?.resetDone === true;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {authError && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 px-4 py-3 text-sm text-clay-danger">
              {authError}
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
