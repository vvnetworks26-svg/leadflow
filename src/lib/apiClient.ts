/**
 * apiClient.ts
 *
 * Central Axios instance for all HTTP repository calls.
 * - Reads VITE_API_URL from env
 * - Attaches JWT access token from localStorage on every request
 * - On 401, clears token (future: add refresh token rotation here)
 * - Normalises error responses into plain Error objects
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach Bearer token ─────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('leadflow_access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: normalise errors ───────────────────────────────────
apiClient.interceptors.response.use(
  res => res,
  (err: AxiosError<{ message?: string; code?: string }>) => {
    const status  = err.response?.status ?? 0;
    const message =
      err.response?.data?.message ??
      err.message ??
      'An unexpected error occurred';

    if (status === 401) {
      // Token expired — clear stored credentials so the app re-prompts login
      localStorage.removeItem('leadflow_access_token');
    }

    // Attach the HTTP status so callers can branch on it without string matching
    const error = Object.assign(new Error(message), {
      status,
      code: err.response?.data?.code,
    });
    return Promise.reject(error);
  }
);

/** Store the access token after login/register. */
export function setAccessToken(token: string): void {
  localStorage.setItem('leadflow_access_token', token);
}

/** Clear the stored access token on logout. */
export function clearAccessToken(): void {
  localStorage.removeItem('leadflow_access_token');
}
