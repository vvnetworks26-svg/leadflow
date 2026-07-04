/**
 * auth/manager.ts
 *
 * CredentialsManager — owns exactly one active CredentialsProvider at a time.
 *
 * Responsibilities:
 *   setProvider()       — replace the active provider (destroys the previous one)
 *   getProvider()       — read-only access to the active provider
 *   clearProvider()     — replace with NullProvider, clears credentials
 *   getHeaders()        — delegate to the active provider
 *   isAuthenticated()   — delegate to the active provider
 *   refreshIfNeeded()   — delegate to the active provider
 *   getDiagnostics()    — return a safe diagnostics snapshot
 *
 * Event emission (via the shared event bus):
 *   CREDENTIALS_PROVIDER_CHANGED — when setProvider() is called
 *   CREDENTIALS_REFRESHED        — when refreshIfNeeded() resolves
 *   CREDENTIALS_CLEARED          — when clearProvider() is called
 *
 * Rules:
 *   - The manager never exposes raw credential values.
 *   - The default provider is NullProvider.
 *   - Calling setProvider(null) is equivalent to clearProvider().
 *   - Provider.initialize() is called after installation.
 *   - Provider.destroy() is called before removal.
 */

import { eventBus }       from '../eventBus';
import { WidgetEvent }    from '../events';
import { NullProvider }   from './null';
import type { CredentialsProvider, CredentialHeaders, CredentialDiagnostics } from './types';

export class CredentialsManager {
  private _provider: CredentialsProvider;

  constructor() {
    this._provider = new NullProvider();
    this._provider.initialize();
  }

  // ─── Provider management ─────────────────────────────────────────────────

  /**
   * Install a new credentials provider.
   *
   * Destroys the current provider, installs and initializes the new one,
   * then emits CREDENTIALS_PROVIDER_CHANGED.
   */
  setProvider(provider: CredentialsProvider): void {
    const previousId = this._provider.id;

    // Tear down the outgoing provider
    this._provider.destroy();

    // Install and initialize the new one
    this._provider = provider;
    this._provider.initialize();

    eventBus.emit(WidgetEvent.CREDENTIALS_PROVIDER_CHANGED, {
      timestamp:   new Date().toISOString(),
      previousId,
      currentId:   provider.id,
    });
  }

  /** Returns the currently active provider. Read-only — do not call methods directly; use the manager. */
  getProvider(): CredentialsProvider {
    return this._provider;
  }

  /**
   * Replace the active provider with NullProvider and clear all credentials.
   * Emits CREDENTIALS_CLEARED.
   */
  clearProvider(): void {
    this._provider.destroy();

    const clearedId  = this._provider.id;
    this._provider   = new NullProvider();
    this._provider.initialize();

    eventBus.emit(WidgetEvent.CREDENTIALS_CLEARED, {
      timestamp:  new Date().toISOString(),
      clearedId,
    });
  }

  // ─── Delegation ───────────────────────────────────────────────────────────

  /**
   * Return the credential headers from the active provider.
   * Always returns a frozen object — safe to spread into request headers.
   */
  getHeaders(): CredentialHeaders {
    try {
      return this._provider.getHeaders();
    } catch {
      // Provider must not throw, but we guard defensively
      return Object.freeze({});
    }
  }

  /** Whether the active provider considers the session authenticated. */
  isAuthenticated(): boolean {
    try {
      return this._provider.isAuthenticated();
    } catch {
      return false;
    }
  }

  /**
   * Ask the active provider to refresh its credentials if necessary.
   * Emits CREDENTIALS_REFRESHED on completion.
   */
  async refreshIfNeeded(): Promise<void> {
    try {
      await this._provider.refreshIfNeeded();
    } catch {
      // Refresh failures are swallowed — providers handle their own error logging
    }

    eventBus.emit(WidgetEvent.CREDENTIALS_REFRESHED, {
      timestamp:  new Date().toISOString(),
      providerId: this._provider.id,
    });
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  /**
   * Return a safe snapshot of the manager state.
   * Never exposes raw credentials.
   */
  getDiagnostics(): CredentialDiagnostics {
    const meta = this._provider.getDiagnostics();
    return {
      providerId:    meta.providerId,
      authenticated: meta.authenticated,
      headerCount:   meta.headerCount,
      lastRefresh:   meta.lastRefresh,
    };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createCredentialsManager(): CredentialsManager {
  return new CredentialsManager();
}
