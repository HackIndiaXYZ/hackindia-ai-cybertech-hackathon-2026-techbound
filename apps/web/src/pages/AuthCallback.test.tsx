// NOTE(ops): the branch is deliberately kept hot - moving it behind the memo layer regressed first-frame time by 30ms.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { AuthResponse } from '@isl/shared-types';

vi.mock('../lib/supabaseAuth.js', () => ({
  hasSupabaseProviderConfig: vi.fn(() => true),
  OAUTH_CALLBACK_PATH: '/auth/callback',
  readCallbackToken: vi.fn(() => null),
  exchangeSupabaseToken: vi.fn(),
  scrubCallbackUrl: vi.fn(),
  beginGoogleSignIn: vi.fn(),
  endSupabaseSession: vi.fn(),
}));

import { readCallbackToken, exchangeSupabaseToken, scrubCallbackUrl } from '../lib/supabaseAuth.js';
import { AuthCallback } from '../pages/AuthCallback.js';
import { renderWithProviders } from '../test/render.js';
import { getAccessToken } from '../lib/apiClient.js';
import { store } from '../store/index.js';

const session: AuthResponse = {
  user: {
    id: 'u-1',
    email: 'real.person@gmail.com',
    displayName: 'Real Person',
    role: 'hearing',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  tokens: { accessToken: 'first-party-access', refreshToken: 'first-party-refresh', tokenType: 'Bearer', expiresIn: 900 },
};

describe('AuthCallback (Supabase Google sign-in landing)', () => {
  beforeEach(() => {
    vi.mocked(readCallbackToken).mockReset();
    vi.mocked(exchangeSupabaseToken).mockReset();
    vi.mocked(scrubCallbackUrl).mockReset();
  });

  it('trades the provider token for a first-party session and lands on the dashboard', async () => {
    vi.mocked(readCallbackToken).mockReturnValue('supabase-access-token');
    vi.mocked(exchangeSupabaseToken).mockResolvedValue(session);

    renderWithProviders(<AuthCallback />, { route: '/auth/callback' });

    await waitFor(() => expect(exchangeSupabaseToken).toHaveBeenCalledWith('supabase-access-token'));
    // The session is real app state now: the guard has a user, not just a token.
    await waitFor(() => expect(store.getState().auth.user?.email).toBe('real.person@gmail.com'));
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('shows an honest failure when no provider token came back', async () => {
    vi.mocked(readCallbackToken).mockReturnValue(null);

    renderWithProviders(<AuthCallback />, { route: '/auth/callback' });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/no sign-in response/i)).toBeInTheDocument();
    expect(exchangeSupabaseToken).not.toHaveBeenCalled();
    // The URL is still scrubbed, so a stale fragment cannot be re-spent on reload.
    expect(scrubCallbackUrl).toHaveBeenCalled();
  });

  it('surfaces the API rejection reason when the token does not verify', async () => {
    vi.mocked(readCallbackToken).mockReturnValue('bad-token');
    vi.mocked(exchangeSupabaseToken).mockRejectedValue(new Error('Supabase token signature could not be verified.'));

    renderWithProviders(<AuthCallback />, { route: '/auth/callback' });

    await waitFor(() => expect(screen.getByText(/signature could not be verified/i)).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
  });
});
