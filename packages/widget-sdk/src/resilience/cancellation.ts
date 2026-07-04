/**
 * resilience/cancellation.ts
 *
 * CancellationSource and CancellationToken.
 *
 * Pattern:
 *   - The caller holds a CancellationSource (can call cancel())
 *   - The executor holds a CancellationToken (read-only view)
 *   - Cancellation propagates to an internal AbortController
 *   - toAbortSignal() bridges to native browser AbortSignal
 *
 * Rules:
 *   - Cancellation is one-way and permanent — cannot be un-cancelled
 *   - Subscribers fire synchronously on cancel()
 *   - If already cancelled, new subscribers fire immediately
 *   - No I/O, no timers — pure in-memory coordination
 */

import type { CancellationSource, CancellationToken } from './types';

// ─── Implementation ───────────────────────────────────────────────────────────

class CancellationTokenImpl implements CancellationToken {
  private _cancelled = false;
  private _reason:    string | null = null;
  private _listeners: Set<(reason: string | null) => void> = new Set();
  private _controller: AbortController = new AbortController();

  get isCancelled(): boolean { return this._cancelled; }
  get reason():      string | null { return this._reason; }

  subscribe(callback: (reason: string | null) => void): () => void {
    if (this._cancelled) {
      callback(this._reason);
      return () => {};
    }
    this._listeners.add(callback);
    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback: (reason: string | null) => void): void {
    this._listeners.delete(callback);
  }

  toAbortSignal(): AbortSignal {
    return this._controller.signal;
  }

  /** Called only by CancellationSourceImpl. */
  _cancel(reason?: string): void {
    if (this._cancelled) return;
    this._cancelled = true;
    this._reason    = reason ?? null;
    this._controller.abort();

    for (const cb of this._listeners) {
      try { cb(this._reason); } catch { /* isolate listener errors */ }
    }
    this._listeners.clear();
  }
}

class CancellationSourceImpl implements CancellationSource {
  private readonly _token: CancellationTokenImpl;

  constructor() {
    this._token = new CancellationTokenImpl();
  }

  get token(): CancellationToken {
    return this._token;
  }

  cancel(reason?: string): void {
    this._token._cancel(reason);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new CancellationSource + its associated CancellationToken.
 *
 * Usage:
 *   const source = createCancellationSource();
 *   const token  = source.token;
 *   token.subscribe(reason => console.log('Cancelled:', reason));
 *   source.cancel('user navigated away');
 */
export function createCancellationSource(): CancellationSource {
  return new CancellationSourceImpl();
}

/**
 * A permanently-cancelled token. Useful as a sentinel value.
 */
export function cancelledToken(reason = 'pre-cancelled'): CancellationToken {
  const src = new CancellationSourceImpl();
  src.cancel(reason);
  return src.token;
}
