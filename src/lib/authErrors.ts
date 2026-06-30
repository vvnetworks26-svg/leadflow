/**
 * authErrors.ts
 *
 * Maps HTTP status codes and backend error codes to user-friendly messages.
 * No raw backend text is ever shown to the user.
 *
 * Usage:
 *   const { message, type } = mapAuthError(err);
 *   // type: 'inline' — show near the form
 *   // type: 'toast'  — show as a toast notification
 */

export interface AuthErrorResult {
  /** The sanitised message safe to show in the UI. */
  message: string;
  /**
   * 'inline' — credential / validation errors that belong near the form.
   * 'toast'  — server / network errors that should be toasted globally.
   */
  display: 'inline' | 'toast';
}

/**
 * Structured error thrown by the API client.
 * The `status` field is attached by the response interceptor.
 */
export interface ApiClientError extends Error {
  status?: number;
  code?: string;
}

/**
 * Convert any thrown error from an auth operation into a sanitised result.
 */
export function mapAuthError(err: unknown): AuthErrorResult {
  const e = err as ApiClientError;
  const status = e.status ?? 0;
  const raw    = (e.message ?? '').toLowerCase();

  // ── 401 Unauthorized ───────────────────────────────────────────────────────
  if (status === 401 || raw.includes('invalid') || raw.includes('incorrect') || raw.includes('credentials')) {
    return {
      message: 'Incorrect email or password. Please try again.',
      display: 'inline',
    };
  }

  // ── 403 Forbidden ──────────────────────────────────────────────────────────
  if (status === 403) {
    return {
      message: 'You do not have permission to access this resource.',
      display: 'toast',
    };
  }

  // ── 404 Not Found ──────────────────────────────────────────────────────────
  if (status === 404) {
    return {
      message: 'Account not found. Please check your email or create a new account.',
      display: 'inline',
    };
  }

  // ── 409 Conflict — duplicate email ─────────────────────────────────────────
  if (status === 409 || raw.includes('already') || raw.includes('exists') || raw.includes('taken')) {
    return {
      message: 'An account with this email already exists. Please sign in instead.',
      display: 'inline',
    };
  }

  // ── 422 Validation Error ───────────────────────────────────────────────────
  if (status === 422 || raw.includes('validation') || raw.includes('required') || raw.includes('invalid email')) {
    return {
      message: 'Please check your details and try again. All fields are required.',
      display: 'inline',
    };
  }

  // ── 429 Rate Limited ──────────────────────────────────────────────────────
  if (status === 429 || raw.includes('rate') || raw.includes('too many')) {
    return {
      message: 'Too many attempts. Please wait a moment before trying again.',
      display: 'inline',
    };
  }

  // ── 500+ Server Error ──────────────────────────────────────────────────────
  if (status >= 500) {
    return {
      message: 'Something went wrong on our end. Please try again in a moment.',
      display: 'toast',
    };
  }

  // ── Network / timeout ─────────────────────────────────────────────────────
  if (raw.includes('network') || raw.includes('timeout') || raw.includes('econnrefused') || status === 0) {
    return {
      message: 'Unable to reach the server. Please check your connection and try again.',
      display: 'toast',
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    message: 'Something went wrong. Please try again.',
    display: 'toast',
  };
}
