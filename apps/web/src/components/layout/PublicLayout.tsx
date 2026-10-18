import { Link, Outlet } from 'react-router-dom';
import { AccessibilityToolbar } from '../AccessibilityToolbar.js';

/**
 * Minimal, accessible shell for public (pre-auth) pages: skip link, header with
 * brand + accessibility toolbar + auth actions, main landmark, and footer.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-clay-edge/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <Link to="/" className="text-lg font-bold text-clay-primary">
            MissingWhisper
          </Link>
          <nav aria-label="Public" className="ml-auto flex items-center gap-2">
            <Link to="/how-it-works" className="rounded-clay px-3 py-2 text-sm font-medium text-clay-ink hover:bg-clay-soft">
              How it works
            </Link>
            <Link to="/accessibility" className="rounded-clay px-3 py-2 text-sm font-medium text-clay-ink hover:bg-clay-soft">
              Accessibility
            </Link>
            <Link to="/login" className="rounded-clay px-3 py-2 text-sm font-medium text-clay-primary hover:bg-clay-soft">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-clay bg-clay-primary px-4 py-2 text-sm font-semibold text-white shadow-clay hover:bg-clay-primary-dark"
            >
              Get started
            </Link>
          </nav>
          <AccessibilityToolbar className="w-full justify-end md:w-auto md:ml-3" />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-clay-edge/60 py-6">
        <div className="mx-auto max-w-6xl px-4 text-sm text-clay-muted">
          <p>ISL Real-Time Communication Platform — built accessibility-first (WCAG 2.1 AA).</p>
        </div>
      </footer>
    </div>
  );
}
