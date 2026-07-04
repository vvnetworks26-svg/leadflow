/**
 * auth/anonymous.ts
 *
 * AnonymousProvider — identifies the widget to the server without
 * authenticating a user.
 *
 * Adds configurable anonymous headers such as:
 *   X-LeadFlow-Business: <businessId>
 *   X-LeadFlow-Widget:   <widgetId>
 *
 * Behaviour:
 *   - getHeaders()      → the configured headers (always present)
 *   - isAuthenticated() → false  (anonymous ≠ authenticated)
 *   - refreshIfNeeded() → no-op  (headers are static)
 *   - clear()           → removes all configured headers
 */

import type { CredentialsProvider, CredentialHeaders, CredentialMetadata } from './types';

export interface AnonymousProviderOptions {
  /**
   * The static headers to include on every request.
   * Keys should follow the X-LeadFlow-* convention.
   *
   * Example:
   *   { 'x-leadflow-business': 'biz_123', 'x-leadflow-widget': 'w_abc' }
   */
  headers: Record<string, string>;
}

export class AnonymousProvider implements CredentialsProvider {
  readonly id = 'anonymous';

  private _headers: Record<string, string>;

  constructor(options: AnonymousProviderOptions) {
    this._headers = { ...options.headers };
  }

  initialize(): void { /* no setup needed */ }

  destroy(): void {
    this.clear();
  }

  getHeaders(): CredentialHeaders {
    return Object.freeze({ ...this._headers });
  }

  isAuthenticated(): boolean {
    // Anonymous ≠ authenticated — the server knows who the widget is
    // but has not verified any user identity.
    return false;
  }

  async refreshIfNeeded(): Promise<void> {
    // Static headers never need refreshing
  }

  clear(): void {
    this._headers = {};
  }

  getDiagnostics(): CredentialMetadata {
    return {
      providerId:   this.id,
      authenticated: false,
      headerCount:  Object.keys(this._headers).length,
      lastRefresh:  null,
      providerType: 'anonymous',
    };
  }
}
