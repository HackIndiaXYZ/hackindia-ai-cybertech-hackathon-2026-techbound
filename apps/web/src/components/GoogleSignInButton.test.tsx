import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OAuthStatusResponse } from '@isl/shared-types';

vi.mock('../lib/supabaseAuth.js', () => ({
  hasSupabaseProviderConfig: vi.fn(() => true),
  OAUTH_CALLBACK_PATH: '/auth/callback',
  beginGoogleSignIn: vi.fn(),
  readCallbackToken: vi.fn(() => null),
  exchangeSupabaseToken: vi.fn(),
  scrubCallbackUrl: vi.fn(),
  endSupabaseSession: vi.fn(),
}));

vi.mock('../lib/devGoogleToken.js', () => ({
  canMintDevProviderToken: vi.fn(() => false),
  mintDevProviderToken: vi.fn(async () => 'dev-token'),
  DEV_CALLBACK_FRAGMENT: (t: string) => `#access_token=${t}`,
}));

import { beginGoogleSignIn, hasSupabaseProviderConfig } from '../lib/supabaseAuth.js';
import { canMintDevProviderToken } from '../lib/devGoogleToken.js';
import { GoogleSignInButton, useOAuthAvailability } from '../components/GoogleSignInButton.js';
import { renderWithProviders } from '../test/render.js';

/**
 * The Google entry point must appear exactly when the flow can be completed, and
 * never as a dead control: it probes the API's capability before rendering, and
 * the credential form only steps aside for a *real* provider (§29 honesty).
 */

function stubStatus(mode: OAuthStatusResponse['mode'], available = mode !== 'unconfigured') {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { available, mode } }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function Probe() {
  const availability = useOAuthAvailability();
  return <div data-testid="probe">{availability}</div>;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(beginGoogleSignIn).mockReset();
  vi.mocked(canMintDevProviderToken).mockReset();
  vi.mocked(hasSupabaseProviderConfig).mockReset().mockReturnValue(true);
});

describe('useOAuthAvailability + GoogleSignInButton', () => {
  it('reports the real provider and renders the button', async () => {
    stubStatus('supabase');
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('google'));

    renderWithProviders(<GoogleSignInButton availability="google" />);
    const button = await screen.findByRole('button', { name: /Continue with Google/ });
    // A configured provider is presented as real Google sign-in, not a sim.
    expect(button).not.toHaveTextContent('dev simulate');
  });

  it('starts the Supabase flow when pressed', async () => {
    renderWithProviders(<GoogleSignInButton availability="google" />);
    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(beginGoogleSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no provider is configured', async () => {
    stubStatus('unconfigured', false);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('unavailable'));

    const { unmount } = renderWithProviders(<GoogleSignInButton availability="unavailable" />);
    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    unmount();
  });

  it('labels the dev-only simulation honestly and never hides the email form for it', async () => {
    // No project creds in the browser, but the API can verify a dev token.
    vi.mocked(hasSupabaseProviderConfig).mockReturnValue(false);
    stubStatus('dev');
    vi.mocked(canMintDevProviderToken).mockReturnValue(true);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('dev-simulate'));

    renderWithProviders(<GoogleSignInButton availability="dev-simulate" />);
    expect(await screen.findByRole('button', { name: /Continue with Google \(dev simulate\)/ })).toBeInTheDocument();
  });

  it('reports a start failure instead of silently doing nothing', async () => {
    vi.mocked(beginGoogleSignIn).mockRejectedValue(new Error('Popup blocked.'));
    renderWithProviders(<GoogleSignInButton availability="google" />);
    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Popup blocked.'));
  });
});
