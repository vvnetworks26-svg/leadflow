/**
 * AuthContext.tsx
 *
 * Authentication context wired to the LeadFlow Express backend.
 *
 * Storage keys:
 *   leadflow_access_token   — JWT access token (15 min)
 *   leadflow_refresh_token  — JWT refresh token (7 days)
 *   leadflow_user           — serialised User object (cache)
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { apiClient, setAccessToken, clearAccessToken } from '../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthUser extends User {
  role?: string;
}

interface AuthContextType {
  isSignedIn: boolean;
  isLoaded: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, firstName: string, lastName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const KEYS = {
  accessToken:  'leadflow_access_token',
  refreshToken: 'leadflow_refresh_token',
  user:         'leadflow_user',
} as const;

function storeSession(user: AuthUser, accessToken: string, refreshToken: string): void {
  setAccessToken(accessToken);
  localStorage.setItem(KEYS.refreshToken, refreshToken);
  localStorage.setItem(KEYS.user, JSON.stringify(user));
}

function clearSession(): void {
  clearAccessToken();
  localStorage.removeItem(KEYS.refreshToken);
  localStorage.removeItem(KEYS.user);
}

/** Map the backend user shape → frontend User interface */
function mapUser(backendUser: any): AuthUser {
  return {
    id:        backendUser.id,
    firstName: backendUser.firstName,
    lastName:  backendUser.lastName,
    email:     backendUser.email,
    imageUrl:  backendUser.imageUrl ?? generateAvatar(backendUser.firstName),
    role:      backendUser.role,
  };
}

function generateAvatar(firstName: string): string {
  // Deterministic Unsplash avatar — no external auth needed
  const seeds = [
    '1472099645785-5658abf4ff4e',
    '1534528741775-53994a69daeb',
    '1507003211169-0a1dd7228f2d',
  ];
  const idx = (firstName.charCodeAt(0) ?? 0) % seeds.length;
  return `https://images.unsplash.com/photo-${seeds[idx]}?w=150&h=150&fit=crop&crop=face`;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoaded, setIsLoaded]     = useState(false);
  const [user, setUser]             = useState<AuthUser | null>(null);

  /**
   * On mount: attempt to restore session.
   * 1. If we have an access token, call GET /auth/me.
   * 2. If that fails (expired), try POST /auth/refresh.
   * 3. If refresh also fails, clear session and stay logged out.
   */
  useEffect(() => {
    async function restoreSession() {
      const accessToken  = localStorage.getItem(KEYS.accessToken);
      const refreshToken = localStorage.getItem(KEYS.refreshToken);
      const cachedUser   = localStorage.getItem(KEYS.user);

      if (!accessToken && !refreshToken) {
        setIsLoaded(true);
        return;
      }

      // Optimistically show cached user while verifying
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
          setIsSignedIn(true);
        } catch { /* ignore parse error */ }
      }

      try {
        // Verify the access token is still valid
        const res = await apiClient.get<{ data: { user: any } }>('/auth/me');
        const freshUser = mapUser(res.data.data.user);
        setUser(freshUser);
        setIsSignedIn(true);
        localStorage.setItem(KEYS.user, JSON.stringify(freshUser));
      } catch {
        // Access token expired — try refresh
        if (!refreshToken) {
          clearSession();
          setUser(null);
          setIsSignedIn(false);
          setIsLoaded(true);
          return;
        }
        try {
          const refreshRes = await apiClient.post<{ data: { tokens: { accessToken: string; refreshToken: string } } }>(
            '/auth/refresh',
            { refreshToken }
          );
          const { accessToken: newAccess, refreshToken: newRefresh } = refreshRes.data.data.tokens;
          setAccessToken(newAccess);
          localStorage.setItem(KEYS.refreshToken, newRefresh);

          const meRes = await apiClient.get<{ data: { user: any } }>('/auth/me');
          const freshUser = mapUser(meRes.data.data.user);
          setUser(freshUser);
          setIsSignedIn(true);
          localStorage.setItem(KEYS.user, JSON.stringify(freshUser));
        } catch {
          // Refresh also failed — clear everything
          clearSession();
          setUser(null);
          setIsSignedIn(false);
        }
      } finally {
        setIsLoaded(true);
      }
    }

    restoreSession();
  }, []);

  /**
   * Login with email + password.
   * Stores JWT tokens and user on success.
   * Throws a user-friendly error on failure.
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await apiClient.post<{
      data: { user: any; tokens: { accessToken: string; refreshToken: string } }
    }>('/auth/login', { email, password });

    const { user: backendUser, tokens } = res.data.data;
    const mappedUser = mapUser(backendUser);

    storeSession(mappedUser, tokens.accessToken, tokens.refreshToken);
    setUser(mappedUser);
    setIsSignedIn(true);
  }, []);

  /**
   * Register a new account.
   * Role defaults to 'owner' — not exposed in the UI.
   */
  const signup = useCallback(async (
    email: string,
    firstName: string,
    lastName: string,
    password: string
  ): Promise<void> => {
    const res = await apiClient.post<{
      data: { user: any; tokens: { accessToken: string; refreshToken: string } }
    }>('/auth/register', { email, firstName, lastName, password, role: 'owner' });

    const { user: backendUser, tokens } = res.data.data;
    const mappedUser = mapUser(backendUser);

    storeSession(mappedUser, tokens.accessToken, tokens.refreshToken);
    setUser(mappedUser);
    setIsSignedIn(true);
  }, []);

  /**
   * Logout: call backend then clear local state.
   */
  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = localStorage.getItem(KEYS.refreshToken);
    try {
      // Send the refresh token in the body — no access token required
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Proceed with local logout even if the request fails
    } finally {
      clearSession();
      setUser(null);
      setIsSignedIn(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isSignedIn, isLoaded, user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useUser must be used within AuthProvider');
  return {
    isLoaded:  ctx.isLoaded,
    isSignedIn: ctx.isSignedIn,
    user:      ctx.user,
    login:     ctx.login,
    signup:    ctx.signup,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return {
    isLoaded: ctx.isLoaded,
    userId:   ctx.user?.id ?? null,
    signOut:  ctx.logout,
  };
}

// ─── Convenience guard components (kept for backward compat) ──────────────────

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded || !isSignedIn) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  if (isLoaded && isSignedIn) return null;
  return <>{children}</>;
}
