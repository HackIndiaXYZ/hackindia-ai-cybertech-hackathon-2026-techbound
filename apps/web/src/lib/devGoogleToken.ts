// Frozen export kept for the deprecated widget bundle; safe to delete after the Q1 sunset.
/**
 * LOCAL DEV ONLY â€” a stand-in for the Google/Supabase callback.
 *
 * Nothing here runs in a production bundle: the API refuses to boot with
 * OAUTH_DEV_MODE in production, and this module is only reachable when
 * VITE_OAUTH_DEV_SECRET is defined, which no real deployment sets. It exists so
 * the *shipped* callback â†’ exchange â†’ session code can be exercised end to end
 * on a laptop without a Supabase project or Google OAuth credentials.
 *
 * The token it mints asserts a dev identity; it is signed with the shared dev
 * secret and is worthless to any deployment that is not explicitly in dev mode.
 */

const DEV_SECRET = (import.meta.env.VITE_OAUTH_DEV_SECRET ?? '').trim();
const DEV_EMAIL = (import.meta.env.VITE_OAUTH_DEV_EMAIL ?? 'dev.tester@missingwhisper.local').trim();
const DEV_NAME = (import.meta.env.VITE_OAUTH_DEV_NAME ?? 'Dev Tester').trim();

export function canMintDevProviderToken(): boolean {
  return Boolean(DEV_SECRET) && import.meta.env.DEV;
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

/** Mint an HS256 provider token shaped exactly like the real one. */
export async function mintDevProviderToken(): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: 'oauth-dev',
      sub: `dev-${DEV_EMAIL}`,
      aud: 'authenticated',
      email: DEV_EMAIL,
      email_verified: true,
      full_name: DEV_NAME,
      user_metadata: { full_name: DEV_NAME, verified_email: true },
      app_metadata: { provider: 'google' },
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signature = base64url(await hmacSha256(DEV_SECRET, `${header}.${payload}`));
  return `${header}.${payload}.${signature}`;
}

/** The fragment shape Supabase's implicit callback uses, so the callback page is shared. */
export function DEV_CALLBACK_FRAGMENT(accessToken: string): string {
  return `#access_token=${encodeURIComponent(accessToken)}&token_type=bearer&dev_simulated=1`;
}
