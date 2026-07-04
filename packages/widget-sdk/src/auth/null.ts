/**
 * auth/null.ts
 *
 * NullProvider — the default provider installed on startup.
 *
 * Behaviour:
 *   - getHeaders()      → always {}
 *   - isAuthenticated() → always false
 *   - refreshIfNeeded() → immediate no-op
 *   - clear()           → no-op
 *
 * Used as the safe default so the transport always has a valid provider
 * even before any credentials are configured.
 */

import type { CredentialsProvider, CredentialHeaders, CredentialMetadata } from './types';

export class NullProvider implements CredentialsProvider {
  readonly id = 'null';

  initialize(): void { /* no-op */ }
  destroy():    void { /* no-op */ }
  clear():      void { /* no-op */ }

  getHeaders(): CredentialHeaders {
    return Object.freeze({});
  }

  isAuthenticated(): boolean {
    return false;
  }

  async refreshIfNeeded(): Promise<void> {
    // Intentional no-op
  }

  getDiagnostics(): CredentialMetadata {
    return {
      providerId:   this.id,
      authenticated: false,
      headerCount:  0,
      lastRefresh:  null,
      providerType: 'null',
    };
  }
}
