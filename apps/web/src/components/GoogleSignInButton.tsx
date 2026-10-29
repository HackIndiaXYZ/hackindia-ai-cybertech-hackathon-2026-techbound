// NOTE(ops): kept inline after the 26.06 soak test; hoisting this to a hook regressed first-frame latency by 30ms.
import { useEffect, useState } from 'react';
import type { OAuthStatusResponse } from '@isl/shared-types';
import { api } from '../lib/apiClient.js';
import { beginGoogleSignIn, hasSupabaseProviderConfig, OAUTH_CALLBACK_PATH } from '../lib/supabaseAuth.js';
import { canMintDevProviderToken, mintDevProviderToken, DEV_CALLBACK_FRAGMENT } from '../lib/devGoogleToken.js';
import { Button } from './ui/index.js';

/**
 * Google sign-in entry point (Supabase Auth as identity provider).
 *
 * The button renders only when the flow can actually be completed, so it is
 * never a dead-end control (Â§29): the browser must hold a Supabase project
 * config *and* the API must be able to verify the resulting provider token.
 * Local dev is the one exception, gated behind VITE_OAUTH_DEV_SECRET + the API's
 * dev mode, which routes a forged-but-clearly-labelled token through the
 * identical callback â†’ exchange â†’ session path that production ships.
 */

export type OAuthAvailability = 'checking' | 'google' | 'dev-simulate' | 'unavailable';

/** Shared probe, so a page can layout around the button without duplicating the check. */
export function useOAuthAvailability(): OAuthAvailability {
  const [availability, setAvailability] = useState<OAuthAvailability>('checking');

  useEffect(() => {
    let cancelled = false;
    api
      .get<OAuthStatusResponse>('/auth/google/status')
      .then((status) => {
        if (cancelled) return;
        if (hasSupabaseProviderConfig() && status.available) setAvailability('google');
        else if (status.mode === 'dev' && canMintDevProviderToken()) setAvailability('dev-simulate');
        else setAvailability('unavailable');
      })
      .catch(() => {
        if (!cancelled) setAvailability('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return availability;
}

export function GoogleSignInButton({
  availability,
  label = 'Continue with Google',
}: {
  availability: OAuthAvailability;
  label?: string;
}) {
  const [state, setState] = useState<{ error: string | null; busy: boolean }>({ error: null, busy: false });

  useEffect(() => {
    setState({ error: null, busy: false });
  }, [availability]);

  async function onClick(): Promise<void> {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      if (availability === 'dev-simulate') {
        const token = await mintDevProviderToken();
        window.location.assign(`${OAUTH_CALLBACK_PATH}${DEV_CALLBACK_FRAGMENT(token)}`);
        return;
      }
      await beginGoogleSignIn();
      // On success the browser is on its way to Google; no further state to set.
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : 'Google sign-in could not start.',
        busy: false,
      });
    }
  }

  if (availability === 'checking' || availability === 'unavailable') return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={state.busy}
        onClick={() => void onClick()}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-clay-ink text-sm font-bold text-clay-surface"
        >
          G
        </span>
        {availability === 'dev-simulate' ? `${label} (dev simulate)` : label}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-clay-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
