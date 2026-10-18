import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './store/index.js';
import { fetchMe } from './store/authSlice.js';
import { initAccessToken } from './lib/apiClient.js';
import { applySettingsToDocument } from './lib/accessibility.js';

import { PublicLayout } from './components/layout/PublicLayout.js';
import { AppShell } from './components/layout/AppShell.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';

import { Landing } from './pages/Landing.js';
import { Login } from './pages/Login.js';
import { Signup } from './pages/Signup.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { HowItWorks } from './pages/HowItWorks.js';
import { AccessibilityStatement } from './pages/AccessibilityStatement.js';
import { Dashboard } from './pages/Dashboard.js';
import { Translator } from './pages/Translator.js';
import { Voice } from './pages/Voice.js';
import { Settings } from './pages/Settings.js';
import { History } from './pages/History.js';
import { Contacts } from './pages/Contacts.js';
import { Onboarding } from './pages/Onboarding.js';
import { AdminFeedback } from './pages/AdminFeedback.js';
import { NotFound } from './pages/NotFound.js';

// Babylon.js is heavy and belongs only to the avatar route, so the whole page is
// lazy-loaded into its own chunk (§5). It never burdens the initial bundle.
const Avatar = lazy(() => import('./pages/Avatar.js').then((m) => ({ default: m.Avatar })));
// The Phase 3A pipeline embeds the same Babylon avatar, so it is lazy too — the
// translation engine itself is pure and lightweight; only the avatar pulls the engine.
const Pipeline = lazy(() => import('./pages/Pipeline.js').then((m) => ({ default: m.Pipeline })));
// The Phase 3C standalone translator embeds the same Babylon avatar, so it is lazy too.
const StandaloneTranslator = lazy(() =>
  import('./pages/StandaloneTranslator.js').then((m) => ({ default: m.StandaloneTranslator })),
);
// The in-call signer embeds the 3D avatar, so it is lazy-loaded too.
const Call = lazy(() => import('./pages/Call.js').then((m) => ({ default: m.Call })));

/** Keeps the document root in sync with the user's accessibility settings. */
function SettingsBridge() {
  const settings = useAppSelector((s) => s.settings);
  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);
  return <Outlet />;
}

export function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Restore a persisted session on first load (post-refresh).
    if (initAccessToken()) void dispatch(fetchMe());
  }, [dispatch]);

  return (
    <Routes>
      <Route element={<SettingsBridge />}>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="accessibility" element={<AccessibilityStatement />} />
        </Route>

        <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="history" element={<History />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="admin" element={<AdminFeedback />} />
          <Route path="translator" element={<Translator />} />
          <Route path="voice" element={<Voice />} />
          <Route
            path="avatar"
            element={
              <Suspense fallback={<div className="py-10 text-center text-clay-muted">Loading avatar engine…</div>}>
                <Avatar />
              </Suspense>
            }
          />
          <Route
            path="pipeline"
            element={
              <Suspense fallback={<div className="py-10 text-center text-clay-muted">Loading translation pipeline…</div>}>
                <Pipeline />
              </Suspense>
            }
          />
          <Route
            path="standalone"
            element={
              <Suspense fallback={<div className="py-10 text-center text-clay-muted">Loading standalone translator…</div>}>
                <StandaloneTranslator />
              </Suspense>
            }
          />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route
          path="/call/:sessionId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="flex h-screen items-center justify-center text-clay-muted">Loading call…</div>}>
                <Call />
              </Suspense>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
