import { Link, Outlet } from 'react-router-dom';
import { AccessibilityToolbar } from '../AccessibilityToolbar.js';
import { Button } from '../ui/Button.js';

/**
 * Public (pre-auth) shell in the MissingWhisper design language: brand lockup,
 * calm navigation, display & accessibility controls, and two clear actions.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b-2 border-clay-edge/50 bg-clay-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="brand-mark" aria-label="MissingWhisper home">
            Missing<span className="hl">Whisper</span>
          </Link>

          <nav aria-label="Public" className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:ml-auto sm:w-auto">
            <Link
              to="/how-it-works"
              className="whitespace-nowrap rounded-clay border-2 border-transparent px-3 py-2 text-sm font-semibold text-clay-ink hover:border-clay-edge/60 hover:bg-clay-soft"
            >
              How it works
            </Link>
            <Link
              to="/accessibility"
              className="whitespace-nowrap rounded-clay border-2 border-transparent px-3 py-2 text-sm font-semibold text-clay-ink hover:border-clay-edge/60 hover:bg-clay-soft"
            >
              Accessibility
            </Link>
            <Link
              to="/login"
              className="whitespace-nowrap rounded-clay border-2 border-transparent px-3 py-2 text-sm font-semibold text-clay-primary hover:border-clay-primary/50"
            >
              Sign in
            </Link>
            <Link to="/signup" className="ml-1">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>

          <AccessibilityToolbar className="ml-auto sm:ml-0" />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <Outlet />
      </main>

      <footer className="border-t-2 border-clay-edge/40 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-clay-muted sm:px-6">
          <p>MissingWhisper — built accessibility-first, WCAG 2.1 AAA contrast targets.</p>
          <p>On-device processing · no audio or video stored</p>
        </div>
      </footer>
    </div>
  );
}
