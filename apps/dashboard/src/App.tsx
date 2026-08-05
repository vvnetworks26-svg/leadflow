import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useUser } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import DashboardLayout from './layouts/DashboardLayout';

// Auth pages
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';

// Dashboard pages
import Overview from './pages/dashboard/Overview';
import Leads from './pages/dashboard/Leads';
import Appointments from './pages/dashboard/Appointments';
import Conversations from './pages/dashboard/Conversations';
import Analytics from './pages/dashboard/Analytics';
import Customers from './pages/dashboard/Customers';
import Settings from './pages/dashboard/Settings';
import Notifications from './pages/dashboard/Notifications';
import KnowledgeBase from './pages/dashboard/KnowledgeBase';
import Billing from './pages/dashboard/Billing';
import Profile from './pages/dashboard/Profile';
import AISettings from './pages/dashboard/AISettings';
import WidgetSettings from './pages/dashboard/WidgetSettings';

// ─── Route guards ─────────────────────────────────────────────────────────────

/**
 * RequireAuth — wraps protected routes.
 * While auth is loading shows a spinner.
 * Once loaded, unauthenticated users are redirected to /sign-in.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mx-auto" />
          <p className="text-sm text-slate-500 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
}

/**
 * RedirectIfAuth — wraps public-only routes (login, register, forgot-password).
 * Authenticated users are redirected to the dashboard.
 */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return null; // wait silently — avoids flash

  if (isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* ── Auth routes (public only) ── */}
            <Route path="/sign-in"         element={<RedirectIfAuth><SignIn /></RedirectIfAuth>} />
            <Route path="/sign-up"         element={<RedirectIfAuth><SignUp /></RedirectIfAuth>} />
            <Route path="/forgot-password" element={<RedirectIfAuth><ForgotPassword /></RedirectIfAuth>} />

            {/* ── Protected dashboard routes ── */}
            <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index                  element={<Overview />} />
              <Route path="inbox"           element={<Conversations />} />
              <Route path="leads"           element={<Leads />} />
              <Route path="appointments"    element={<Appointments />} />
              <Route path="analytics"       element={<Analytics />} />
              <Route path="customers"       element={<Customers />} />
              <Route path="settings"        element={<Settings />} />
              <Route path="notifications"   element={<Notifications />} />
              <Route path="knowledge-base"  element={<KnowledgeBase />} />
              <Route path="billing"         element={<Billing />} />
              <Route path="profile"         element={<Profile />} />
              <Route path="ai-settings"     element={<AISettings />} />
              <Route path="widget-settings" element={<WidgetSettings />} />
            </Route>

            {/* ── Root → sign-in ── */}
            <Route path="/"  element={<Navigate to="/sign-in" replace />} />

            {/* ── Fallback ── */}
            <Route path="*" element={<Navigate to="/sign-in" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
