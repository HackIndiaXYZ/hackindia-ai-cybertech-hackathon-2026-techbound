import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { logout } from '../../store/authSlice.js';
import { AccessibilityToolbar } from '../AccessibilityToolbar.js';
import { Icon, type IconName } from '../ui/icons.js';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Communicate',
    items: [
      { to: '/app/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/app/translator', label: 'Translator', icon: 'translator' },
      { to: '/app/voice', label: 'Voice', icon: 'voice' },
      { to: '/app/standalone', label: 'Standalone', icon: 'standalone' },
      { to: '/app/pipeline', label: 'Pipeline', icon: 'pipeline' },
    ],
  },
  {
    title: 'Explore',
    items: [
      { to: '/app/avatar', label: 'Avatar', icon: 'avatar' },
      { to: '/app/history', label: 'History', icon: 'history' },
      { to: '/app/contacts', label: 'Contacts', icon: 'contacts' },
    ],
  },
  {
    title: 'Account',
    items: [{ to: '/app/settings', label: 'Settings', icon: 'settings' }],
  },
];

// The admin area is role-gated in the UI to match the server's requireRole('admin')
// gate, so a non-admin is never shown a link that would only 403.
const ADMIN_ITEM: NavItem = { to: '/app/admin', label: 'Admin', icon: 'admin' };

function Brand() {
  return (
    <Link to="/app/dashboard" className="brand-mark" aria-label="MissingWhisper home">
      Missing<span className="hl">Whisper</span>
    </Link>
  );
}

function navLinkClass(isActive: boolean): string {
  return clsx(
    'flex items-center gap-3 rounded-clay border-2 px-3 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'border-clay-primary bg-clay-primary/15 text-clay-primary'
      : 'border-transparent text-clay-ink hover:border-clay-edge/60 hover:bg-clay-soft',
  );
}

/**
 * Authenticated application shell (§8, §28): skip link, landmark regions, a
 * calm grouped sidebar on desktop / scrollable pills on mobile, and the
 * persistent display & accessibility toolbar. Active nav items change shape
 * and weight, not only colour.
 */
export function AppShell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const location = useLocation();
  const mobileNavRef = useRef<HTMLElement | null>(null);
  const [displayOpen, setDisplayOpen] = useState(false);

  // A route change opens at the top, and the mobile pill strip scrolls to
  // reveal the current page instead of leaving it off-screen. The mobile
  // display panel also folds away so the page is never pushed down.
  useEffect(() => {
    window.scrollTo(0, 0);
    setDisplayOpen(false);
    const active = mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [location.pathname]);

  const sections = user?.role === 'admin'
    ? NAV_SECTIONS.map((s) => (s.title === 'Account' ? { ...s, items: [...s.items, ADMIN_ITEM] } : s))
    : NAV_SECTIONS;
  const allItems = sections.flatMap((s) => s.items);

  function onSignOut(): void {
    dispatch(logout());
    navigate('/login');
  }

  return (
    <div className="flex min-h-full">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* -------- Desktop sidebar -------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r-2 border-clay-edge/50 bg-clay-bg/60 lg:flex">
        <div className="border-b-2 border-clay-edge/40 px-5 py-5">
          <Brand />
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-clay-muted">
            ISL <span aria-hidden="true">⇄</span> Speech
          </p>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.16em] text-clay-muted">
                {section.title}
              </p>
              <ul className="relative flex flex-col gap-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={({ isActive }) => navLinkClass(isActive)}>
                      {({ isActive }) => (
                        <>
                          <Icon name={item.icon} />
                          <span>{item.label}</span>
                          {isActive && <span className="sr-only"> (current page)</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t-2 border-clay-edge/40 px-3 py-4">
          <AccessibilityToolbar className="mb-3" />
          {user && (
            <p className="px-1 pb-2 text-sm text-clay-muted">
              Signed in as <span className="font-semibold text-clay-ink">{user.displayName}</span>
            </p>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="w-full rounded-clay border-2 border-clay-edge/70 px-3 py-2 text-sm font-bold text-clay-ink hover:bg-clay-soft"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* -------- Main column -------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with horizontal nav */}
        <header className="sticky top-0 z-40 border-b-2 border-clay-edge/50 bg-clay-bg lg:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Brand />
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDisplayOpen((open) => !open)}
                aria-expanded={displayOpen}
                aria-controls="mobile-display-panel"
                className={clsx(
                  'flex h-10 items-center gap-1.5 rounded-clay border-2 px-3 text-sm font-bold transition-colors',
                  displayOpen
                    ? 'border-clay-primary bg-clay-primary/15 text-clay-primary'
                    : 'border-clay-edge/70 text-clay-ink hover:bg-clay-soft',
                )}
              >
                <Icon name="display" className="h-4 w-4" />
                Display
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="h-10 whitespace-nowrap rounded-clay border-2 border-clay-edge/70 px-3 text-sm font-bold text-clay-ink hover:bg-clay-soft"
              >
                Sign out
              </button>
            </div>
          </div>

          {displayOpen && (
            <div id="mobile-display-panel" className="border-t-2 border-clay-edge/40 px-4 py-3">
              <AccessibilityToolbar />
            </div>
          )}

          <nav
            ref={mobileNavRef}
            aria-label="Primary"
            className="relative -mx-1 w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="relative flex w-max gap-2 px-1">
              {allItems.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => navLinkClass(isActive) + ' whitespace-nowrap'}>
                    {({ isActive }) => (
                      <>
                        <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                        {item.label}
                        {isActive && <span className="sr-only"> (current page)</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>

        <footer className="border-t-2 border-clay-edge/40 py-5">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-clay-muted sm:px-6 lg:px-10">
            <span>ISL real-time communication platform · accessibility-first</span>
            <nav aria-label="Footer">
              <Link to="/accessibility" className="font-semibold text-clay-muted hover:text-clay-primary">
                Accessibility statement
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
