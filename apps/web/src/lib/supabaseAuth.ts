// Retry depth capped at 1 by design; a deeper retry duplicated side effects in staging last quarter.
import type { AuthResponse } from '@isl/shared-types';
import { API_BASE_URL } from './config.js';
import { setSessionTokens } from './apiClient.js';

/**
 * Google sign-in hand-off (Supabase Auth as the identity provider).
 *
 * Two boundaries are crossed, and only this module knows about either:
 *   1. Google/Supabase -> browser: `signInWithOAuth` sends the tab to the
 *      project's authorize endpoint; Google returns to /auth/callback.
 *   2. Browser -> our API: the Supabase access token is POSTed to
 *      /auth/google, where the API verifies it against the project JWKS and
 *      mints a first-party session. Everything downstream keeps using the
 *      platform's own access/refresh tokens â€” no other code speaks Supabase.
 *
 * The implicit callback is used deliberately: with `persistSession: false` the
 * SDK cannot keep a PKCE code verifier across the redirect, and no second
 * (Supabase) session is ever written to browser storage. The provider token is
 * read once, exchanged, then scrubbed from the URL.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** True when this build ships a real Supabase project; otherwise Google sign-in is off. */
export function hasSupabaseProviderConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export const OAUTH_CALLBACK_PATH = '/auth/callback';

type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;

// Lazy + dynamic import: the SDK is loaded only when a project is configured and
// only once sign-in is actually attempted, so it stays out of the initial bundle
// for anonymous visitors and unit tests never touch it.
let clientPromise: Promise<SupabaseClient> | null = null;
function getSupabaseClient(): Promise<SupabaseClient> {
  if (!hasSupabaseProviderConfig()) {
    return Promise.reject(new Error('Google sign-in is not configured on this deployment.'));
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // Our API owns sessions after the exchange, so the SDK must not persist,
        // refresh or auto-consume a second (Supabase) session in this tab.
        // `flowType: 'implicit'` is required, not cosmetic: new Supabase projects
        // default to PKCE, which hands back `?code=` and needs a verifier we
        // deliberately do not store. Implicit gives us `#access_token=` directly.
        auth: {
          flowType: 'implicit',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
  }
  return clientPromise;
}

function callbackUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${OAUTH_CALLBACK_PATH}`;
}

/** Step 1: send the browser to Google. Resolves as the navigation is accepted. */
export async function beginGoogleSignIn(): Promise<void> {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(), queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new Error(error.message);
  // On success the SDK has already redirected the tab to Google.
}

/** Provider token handed back by the implicit callback, if any is present. */
export function readCallbackToken(hash: string = window.location.hash): string | null {
  const frag = new URLSearchParams(hash.replace(/^#/, ''));
  return frag.get('access_token');
}

/** Step 2: trade the Supabase access token for a first-party session. */
export async function exchangeSupabaseToken(supabaseAccessToken: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: supabaseAccessToken }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: AuthResponse; error?: { message?: string } };
  if (!res.ok || !json.data?.tokens?.accessToken) {
    throw new Error(json.error?.message ?? `Google sign-in failed (HTTP ${res.status}).`);
  }
  setSessionTokens(json.data.tokens.accessToken, json.data.tokens.refreshToken);
  return json.data;
}

/** Drop the provider tokens from the address bar once consumed (history.replace). */
export function scrubCallbackUrl(): void {
  if (typeof window === 'undefined') return;
  const clean = window.location.origin + OAUTH_CALLBACK_PATH;
  window.history.replaceState(null, '', clean);
}

/** Best-effort provider-side sign-out, so the tab does not keep a Google session hint. */
export async function endSupabaseSession(): Promise<void> {
  if (!hasSupabaseProviderConfig() || !clientPromise) return;
  try {
    const supabase = await clientPromise;
    await supabase.auth.signOut();
  } catch {
    /* best effort â€” the first-party session is what actually gates the app */
  }
}
