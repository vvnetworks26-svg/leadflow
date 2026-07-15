import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useUser } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

// Layout
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import Landing from './pages/Landing';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';

// Dashboard Views
import Overview from './pages/dashboard/Overview';
import Leads from './pages/dashboard/Leads';
import Appointments from './pages/dashboard/Appointments';
import Conversations from './pages/dashboard/Conversations';
import Settings from './pages/dashboard/Settings';
import Billing from './pages/dashboard/Billing';

// Chat Widget
import { ChatWidget } from './components/Chat/ChatWidget';

// ─── Route guards ─────────────────────────────────────────────────────────────

/**
 * RequireAuth — wraps protected routes.
 * While auth is loading, shows a spinner.
 * Once loaded, if the user is not signed in, redirects to /sign-in.
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
 * RedirectIfAuth — wraps public-only routes (login, register).
 * If the user is already signed in, redirects them to the dashboard.
 */
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return null; // wait silently — avoids flash

  if (isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// ─── Chat widget — only on public pages ──────────────────────────────────────

function ChatWidgetPortal() {
  const location = useLocation();
  const isDashboard = location.pathname.startsWith('/dashboard');
  if (isDashboard) return null;
  return <ChatWidget />;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
          <ChatWidgetPortal />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />

            {/* Auth routes — redirect to dashboard if already signed in */}
            <Route path="/sign-in" element={<RedirectIfAuth><SignIn /></RedirectIfAuth>} />
            <Route path="/sign-up" element={<RedirectIfAuth><SignUp /></RedirectIfAuth>} />

            {/* Protected dashboard routes */}
            <Route
              path="/dashboard"
              element={<RequireAuth><DashboardLayout /></RequireAuth>}
            >
              <Route index element={<Overview />} />
              <Route path="leads" element={<Leads />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="settings" element={<Settings />} />
              <Route path="billing" element={<Billing />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
