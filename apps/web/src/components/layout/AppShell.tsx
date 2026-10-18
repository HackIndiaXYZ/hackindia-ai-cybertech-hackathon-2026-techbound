import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { logout } from '../../store/authSlice.js';
import { AccessibilityToolbar } from '../AccessibilityToolbar.js';

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/history', label: 'History' },
  { to: '/app/contacts', label: 'Contacts' },
  { to: '/app/translator', label: 'Translator' },
  { to: '/app/voice', label: 'Voice' },
  { to: '/app/pipeline', label: 'Pipeline' },
  { to: '/app/standalone', label: 'Standalone' },
  { to: '/app/avatar', label: 'Avatar' },
  { to: '/app/settings', label: 'Settings' },
];

// The admin area is role-gated in the UI to match the server's requireRole('admin')
// gate, so a non-admin is never shown a link that would only 403.
const ADMIN_NAV_ITEM = { to: '/app/admin', label: 'Admin' };

/**
 * Authenticated application shell (§8, §28): skip link, landmark regions,
 * responsive primary nav with an active-route indicator that is not color-only,
 * and a persistent accessibility toolbar.
 */
export function AppShell() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const items = user?.role === 'admin' ? [...navItems, ADMIN_NAV_ITEM] : navItems;

  function onSignOut(): void {
    dispatch(logout());
    navigate('/login');
  }

  return (
    <div className="flex min-h-full flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-clay-edge/60 bg-clay-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/app/dashboard" className="text-lg font-bold text-clay-primary">
            MissingWhisper
          </Link>

          <nav aria-label="Primary" className="order-3 w-full md:order-none md:w-auto md:flex-1">
            <ul className="flex flex-wrap gap-1">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'rounded-clay px-4 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-clay-primary text-white' : 'text-clay-ink hover:bg-clay-soft',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {item.label}
                        {isActive && <span className="sr-only"> (current page)</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <AccessibilityToolbar />
            {user && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-sm text-clay-muted">{user.displayName}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-clay bg-clay-soft px-4 py-2 text-sm font-medium text-clay-ink shadow-clay-inset hover:shadow-clay-focus"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-clay-edge/60 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-clay-muted">
          <span>ISL Real-Time Communication Platform</span>
          <nav aria-label="Footer">
            <Link to="/accessibility" className="hover:text-clay-primary">
              Accessibility statement
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
