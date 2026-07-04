/**
 * auth/static.ts
 *
 * StaticTokenProvider — carries a fixed Bearer token for every request.
 *
 * Use cases:
 *   - API keys / service tokens that don't expire
 *   - Development / testing credentials
 *   - Pre-issued tokens with known long lifetimes
 *
 * Behaviour:
 *   - getHeaders()      → { 'authorization': 'Bearer <token>' }
 *   - isAuthenticated() → true  (a token is present)
 *   - refreshIfNeeded() → no-op (no refresh mechanism)
 *   - clear()           → removes the token; isAuthenticated() returns false
 *
 * Constraints:
 *   - No networking. No fetch. No refresh endpoint.
 *   - Token is stored only in memory — never written to any storage.
 *   - getDiagnostics() never returns the token value — only its presence.
 */

import type { CredentialsProvider, CredentialHeaders, CredentialMetadata } from './types';

export interface StaticTokenProviderOptions {
  /**
   * The static Bearer token.
   * Stored in memory only. Never logged or included in diagnostics.
   */
  token: string;

  /**
   * Optional custom header name. Defaults to 'authorization'.
   * Example: 'x-api-key'
   */
  headerName?: string;

  /**
   * Optional value prefix. Defaults to 'Bearer '.
   * Set to '' for raw tokens (e.g. API keys without a scheme).
   */
  prefix?: string;
}

export class StaticTokenProvider implements CredentialsProvider {
  readonly id = 'static-token';

  private _token:      string;
  private _headerName: string;
  private _prefix:     string;

  constructor(options: StaticTokenProviderOptions) {
    this._token      = options.token;
    this._headerName = options.headerName ?? 'authorization';
    this._prefix     = options.prefix     ?? 'Bearer ';
  }

  initialize(): void { /* token is set in constructor */ }

  destroy(): void {
    this.clear();
  }

  getHeaders(): CredentialHeaders {
    if (!this._token) return Object.freeze({});

    return Object.freeze({
      [this._headerName]: `${this._prefix}${this._token}`,
    });
  }

  isAuthenticated(): boolean {
    return this._token.length > 0;
  }

  async refreshIfNeeded(): Promise<void> {
    // Static tokens cannot be refreshed — this is intentional.
  }

  clear(): void {
    this._token = '';
  }

  getDiagnostics(): CredentialMetadata {
    return {
      providerId:   this.id,
      authenticated: this.isAuthenticated(),
      // Report the number of headers, not the token value
      headerCount:  this._token.length > 0 ? 1 : 0,
      lastRefresh:  null,
      providerType: 'static-token',
    };
  }
}
