/**
 * auth/types.ts
 *
 * All public types for the credentials provider architecture.
 * No implementation — pure contracts.
 *
 * Rules:
 *   - No any. No unknown in public surfaces.
 *   - All credential values stay inside providers — never exposed externally.
 *   - CredentialHeaders is a plain frozen Record — safe to merge into requests.
 */

// ─── Credential headers ───────────────────────────────────────────────────────

/**
 * The plain HTTP headers a provider contributes to outgoing requests.
 * Keys are lowercase header names.
 *
 * Examples:
 *   { 'authorization': 'Bearer <token>' }
 *   { 'x-leadflow-business': 'biz_123', 'x-leadflow-widget': 'w_abc' }
 *   {}  — no credentials (NullProvider)
 */
export type CredentialHeaders = Readonly<Record<string, string>>;

// ─── Authentication state ─────────────────────────────────────────────────────

/**
 * Whether the active provider considers the current session authenticated.
 */
export type AuthenticationState = 'authenticated' | 'unauthenticated';

// ─── Credential metadata ──────────────────────────────────────────────────────

/**
 * Optional metadata a provider may expose for diagnostics.
 * Never contains raw secrets — only safe descriptors.
 */
export interface CredentialMetadata {
  /** Provider ID. */
  providerId:       string;
  /** Whether the provider considers the session authenticated. */
  authenticated:    boolean;
  /** Number of credential headers this provider currently returns. */
  headerCount:      number;
  /**
   * ISO-8601 timestamp of the last time credentials were refreshed.
   * Null if refresh has never been called.
   */
  lastRefresh:      string | null;
  /**
   * Human-readable description of the provider type.
   * Examples: 'null', 'anonymous', 'static-token'
   */
  providerType:     string;
}

// ─── Credential diagnostics ───────────────────────────────────────────────────

/**
 * Point-in-time snapshot of the credentials manager state.
 * Returned by credentialsManager.getDiagnostics().
 * Safe to log — no raw tokens, no secrets.
 */
export interface CredentialDiagnostics {
  /** ID of the currently active provider. */
  providerId:    string;
  /** Whether the active provider considers the session authenticated. */
  authenticated: boolean;
  /** Number of credential headers the active provider returns. */
  headerCount:   number;
  /** ISO-8601 timestamp of the last successful refresh, or null. */
  lastRefresh:   string | null;
}

// ─── Provider interface ───────────────────────────────────────────────────────

/**
 * Every credentials provider must implement this interface.
 *
 * Providers are responsible for:
 *   - Producing the headers to attach to outgoing requests
 *   - Indicating whether the session is authenticated
 *   - Refreshing credentials when prompted (no-op for static providers)
 *   - Cleaning up on destroy
 *
 * Providers must NOT:
 *   - Call fetch() directly (transport is separate)
 *   - Access localStorage or cookies
 *   - Block the event loop
 *   - Throw from getHeaders() — return {} on failure
 */
export interface CredentialsProvider {
  /** Unique, stable identifier for this provider instance. */
  readonly id: string;

  /**
   * Called once when the provider is installed via credentialsManager.setProvider().
   * Use for one-time setup (e.g. reading initial state from config).
   */
  initialize(): void;

  /**
   * Called when the provider is replaced or the widget is destroyed.
   * Must clean up timers, subscriptions, and any internal state.
   */
  destroy(): void;

  /**
   * Return the credential headers to attach to outgoing requests.
   * Must return an empty object {} when not authenticated.
   * Must never throw — log errors internally and return {}.
   */
  getHeaders(): CredentialHeaders;

  /**
   * Return whether the current session is considered authenticated.
   */
  isAuthenticated(): boolean;

  /**
   * Attempt to refresh credentials.
   * For static providers: no-op, returns immediately.
   * For future token providers: would call a refresh endpoint.
   * Must never throw — failures should be logged and swallowed.
   */
  refreshIfNeeded(): Promise<void>;

  /**
   * Clear all stored credentials and return to the unauthenticated state.
   */
  clear(): void;

  /**
   * Return diagnostic metadata for this provider.
   * Must never expose raw tokens or secrets.
   */
  getDiagnostics(): CredentialMetadata;
}
