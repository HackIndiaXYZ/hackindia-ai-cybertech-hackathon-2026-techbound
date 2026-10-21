import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UserRole } from '@isl/shared-types';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { signup } from '../store/authSlice.js';
import { Button, Card, Input } from '../components/ui/index.js';
import { Turnstile } from '../components/Turnstile.js';

const roles: { value: UserRole; label: string }[] = [
  { value: 'deaf', label: 'Deaf or hard of hearing (signer)' },
  { value: 'hearing', label: 'Hearing (speech user)' },
  { value: 'interpreter', label: 'ISL interpreter' },
];

/** Sign-up screen collecting email, password, display name and communication role. */
export function Signup() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const status = useAppSelector((s) => s.auth.status);
  const authError = useAppSelector((s) => s.auth.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('deaf');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; email?: string; password?: string }>({});

  const loading = status === 'loading';

  function validateForm(): boolean {
    const nextErrors: { displayName?: string; email?: string; password?: string } = {};
    if (!displayName.trim()) {
      nextErrors.displayName = 'Full name is required.';
    }
    if (!email.trim()) {
      nextErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!validateForm()) return;
    const result = await dispatch(signup({ email, password, displayName, role, turnstileToken: turnstileToken ?? undefined }));
    if (signup.fulfilled.match(result)) navigate('/app/dashboard');
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold text-clay-ink">Create your account</h1>
        <p className="mt-1 text-clay-muted">A few details to tailor the experience to how you communicate.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {authError && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 px-4 py-3 text-sm text-clay-danger">
              {authError}
            </div>
          )}

          <Input
            label="Full name"
            name="displayName"
            autoComplete="name"
            required
            error={fieldErrors.displayName}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (fieldErrors.displayName) setFieldErrors((prev) => ({ ...prev, displayName: undefined }));
            }}
          />
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            error={fieldErrors.email}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters."
            error={fieldErrors.password}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium text-clay-ink">
              How do you communicate?
            </label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="h-12 rounded-clay border-2 border-clay-edge/70 bg-clay-soft px-3 text-clay-ink outline-none focus:border-clay-primary"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <Turnstile onToken={setTurnstileToken} />

          <Button type="submit" fullWidth loading={loading}>
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-clay-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-clay-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
