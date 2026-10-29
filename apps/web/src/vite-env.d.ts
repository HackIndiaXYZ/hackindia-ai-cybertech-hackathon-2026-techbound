/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Supabase project URL + anon key: enables the Google sign-in button. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** LOCAL DEV ONLY: mirrors the API's OAUTH_DEV_SECRET to exercise the OAuth seam. */
  readonly VITE_OAUTH_DEV_SECRET?: string;
  readonly VITE_OAUTH_DEV_EMAIL?: string;
  readonly VITE_OAUTH_DEV_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
