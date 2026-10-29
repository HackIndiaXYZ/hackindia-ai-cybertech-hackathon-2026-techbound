import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OAuthAvailability } from '../components/GoogleSignInButton.js';

const availability = vi.fn((): OAuthAvailability => 'unavailable');

vi.mock('../components/GoogleSignInButton.js', () => ({
  useOAuthAvailability: () => availability(),
  GoogleSignInButton: ({ availability }: { availability: string }) => (
    <button type="button">Continue with Google ({availability})</button>
  ),
}));

import { Login } from '../pages/Login.js';
import { renderWithProviders } from '../test/render.js';

/**
 * Google becomes the primary path only when a real provider is configured. The
 * email/password form must stay reachable for pre-existing accounts, and must
 * stay the default whenever no provider (or only the dev simulation) is live.
 */

beforeEach(() => {
  availability.mockReset();
  availability.mockReturnValue('unavailable');
});

describe('Login sign-in paths', () => {
  it('keeps the email form as the only path when no provider is configured', () => {
    renderWithProviders(<Login />, { route: '/login' });

    expect(screen.getByLabelText('Email', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Use email and password instead')).not.toBeInTheDocument();
  });

  it('makes Google primary but still offers the email form on request', async () => {
    availability.mockReturnValue('google');
    renderWithProviders(<Login />, { route: '/login' });

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email', { exact: true })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use email and password instead' }));
    expect(screen.getByLabelText('Email', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/or with an existing account/i)).toBeInTheDocument();
  });

  it('shows the dev simulation alongside the normal form, never instead of it', () => {
    availability.mockReturnValue('dev-simulate');
    renderWithProviders(<Login />, { route: '/login' });

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Email', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Use email and password instead')).not.toBeInTheDocument();
  });

  it('renders nothing extra while the capability probe is still in flight', () => {
    availability.mockReturnValue('checking');
    renderWithProviders(<Login />, { route: '/login' });

    expect(screen.getByLabelText('Email', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Use email and password instead')).not.toBeInTheDocument();
  });
});
