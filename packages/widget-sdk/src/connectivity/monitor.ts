/**
 * connectivity/monitor.ts
 *
 * ConnectivityMonitor — observes browser online/offline state.
 *
 * Sources:
 *   1. navigator.onLine  — initial state
 *   2. window 'online'   — browser fires when connection is restored
 *   3. window 'offline'  — browser fires when connection is lost
 *
 * Subscriber notifications fire synchronously when state changes.
 * Duplicate notifications are suppressed (state must actually change).
 *
 * Rules:
 *   - No I/O, no timers, no fetch probes
 *   - Safe to call dispose() multiple times
 *   - When window/navigator are unavailable (SSR/test), reports 'unknown'
 */

import type { ConnectivityMonitor, ConnectivityState, ConnectivityStatus } from './types';

export function createConnectivityMonitor(): ConnectivityMonitor {
  let _state:          ConnectivityState = 'unknown';
  let _lastChangedAt:  string | null     = null;
  let _lastReconnect:  string | null     = null;
  let _disposed        = false;

  const _listeners: Set<(state: ConnectivityState) => void> = new Set();

  // ── Determine initial state ───────────────────────────────────────────────
  if (typeof navigator !== 'undefined') {
    _state = navigator.onLine ? 'online' : 'offline';
  }

  // ── Internal state change handler ────────────────────────────────────────
  function _onChange(newState: ConnectivityState): void {
    if (newState === _state) return;
    const prev = _state;
    _state        = newState;
    _lastChangedAt = new Date().toISOString();
    if (newState === 'online' && prev === 'offline') {
      _lastReconnect = _lastChangedAt;
    }
    for (const cb of _listeners) {
      try { cb(newState); } catch { /* isolate listener errors */ }
    }
  }

  // ── Browser event handlers ────────────────────────────────────────────────
  const _onOnline  = () => _onChange('online');
  const _onOffline = () => _onChange('offline');

  if (typeof window !== 'undefined') {
    window.addEventListener('online',  _onOnline,  { passive: true });
    window.addEventListener('offline', _onOffline, { passive: true });
  }

  return {
    isOnline(): boolean {
      return _state === 'online';
    },

    status(): ConnectivityStatus {
      return {
        state:           _state,
        lastChangedAt:   _lastChangedAt,
        lastReconnectAt: _lastReconnect,
      };
    },

    subscribe(callback: (state: ConnectivityState) => void): () => void {
      _listeners.add(callback);
      return () => this.unsubscribe(callback);
    },

    unsubscribe(callback: (state: ConnectivityState) => void): void {
      _listeners.delete(callback);
    },

    dispose(): void {
      if (_disposed) return;
      _disposed = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online',  _onOnline);
        window.removeEventListener('offline', _onOffline);
      }
      _listeners.clear();
    },
  };
}
