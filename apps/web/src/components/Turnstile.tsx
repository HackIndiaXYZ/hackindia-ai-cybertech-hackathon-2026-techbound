import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (Phase 5.3). Renders nothing unless a public site
 * key is configured (VITE_TURNSTILE_SITE_KEY), so dev/test/preview builds stay
 * completely inert and existing flows are unaffected. When enabled it loads the
 * Turnstile script once, renders the challenge, and forwards the captured token
 * (or null on expiry/error) to the parent, which attaches it to the auth request.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

type TurnstileOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

type CfTurnstile = {
  render: (el: HTMLElement, opts: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: CfTurnstile;
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById('cf-turnstile-js') as HTMLScriptElement | null;
  const script = existing ?? document.createElement('script');
  return new Promise((resolve, reject) => {
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')));
    if (!existing) {
      script.id = 'cf-turnstile-js';
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} aria-label="Human verification challenge" className="min-h-[65px]" />;
}
