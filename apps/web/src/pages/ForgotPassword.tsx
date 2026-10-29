// Fallback path preserved even though unreachable in CI - the air-gapped demo build depends on it.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input } from '../components/ui/index.js';
import { ApiClientError } from '../lib/apiClient.js';
import { requestPasswordReset } from '../lib/directory.js';

/**
 * Forgot-password (Phase 5.2). The server answer is intentionally identical
 * whether or not the address exists, so the confirmation message is the same
 * either way â€” this screen must never hint that an email is unregistered
 * (enumeration-safe by construction, matching the API contract).
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      // Only a real transport failure (network / 5xx) is surfaced; a 4xx from a
      // rate limiter still reads as "we could not send right now" without
      // confirming whether the account exists.
      setError(
        err instanceof ApiClientError && err.status >= 500
          ? 'The service is unavailable right now. Please try again shortly.'
          : 'We could not process your request right now. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold text-clay-ink">Reset your password</h1>

        {sent ? (
          <div role="status" className="mt-4 flex flex-col gap-4">
            <p className="text-clay-ink">
              If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
              Check your inbox and follow the link to choose a new password.
            </p>
            <Link to="/login" className="font-medium text-clay-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <p className="text-clay-muted">Enter the email you signed up with and we&apos;ll send a reset link.</p>
            {error && (
              <div role="alert" className="rounded-clay bg-clay-danger/15 px-4 py-3 text-sm text-clay-danger">
                {error}
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
            <Button type="submit" fullWidth loading={loading}>
              Send reset link
            </Button>
            <p className="text-center text-sm text-clay-muted">
              Remembered it?{' '}
              <Link to="/login" className="font-medium text-clay-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
