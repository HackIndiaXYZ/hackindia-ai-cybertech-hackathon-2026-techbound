import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input } from '../components/ui/index.js';
import { resetPassword } from '../lib/directory.js';

/**
 * Reset-password (Phase 5.2). Reached from the link in the reset email as
 * /reset-password?token=… . The token is single-use and consumed server-side, so
 * after a success we route to sign-in; a bad or expired token surfaces the
 * server's own message and sends the user back to request a fresh link.
 */
export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasToken = token.length >= 32;

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFieldError(null);
    setApiError(null);
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFieldError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/login', { state: { resetDone: true } });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'We could not reset your password. Please request a new link.');
    } finally {
      setLoading(false);
    }
  }

  if (!hasToken) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Card>
          <h1 className="text-2xl font-semibold text-clay-ink">Invalid reset link</h1>
          <p className="mt-3 text-clay-ink" role="alert">
            This reset link is missing or malformed. Please request a new one.
          </p>
          <Link to="/forgot-password" className="mt-4 inline-block font-medium text-clay-primary hover:underline">
            Request a new link
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold text-clay-ink">Choose a new password</h1>
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {apiError && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 px-4 py-3 text-sm text-clay-danger">
              {apiError}
            </div>
          )}
          <Input
            label="New password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            error={fieldError ?? undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirm new password"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" fullWidth loading={loading}>
            Reset password
          </Button>
        </form>
      </Card>
    </div>
  );
}
