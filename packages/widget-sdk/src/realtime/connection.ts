/**
 * realtime/connection.ts
 *
 * Connection lifecycle manager.
 * Owns connect/disconnect/reconnect state transitions.
 * Delegates actual I/O to the RealtimeAdapter.
 */

import { eventBus }       from '../eventBus';
import { WidgetEvent }    from '../events';
import type { RealtimeAdapter, RealtimeState, ConnectionStatus, ReconnectPolicy } from './types';

function now(): string { return new Date().toISOString(); }

export interface ConnectionManager {
  connect(): Promise<void>;
  disconnect(): void;
  reconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  getState(): RealtimeState;
}

export function createConnectionManager(
  adapter:  RealtimeAdapter,
  policy:   ReconnectPolicy
): ConnectionManager {
  let _state:          RealtimeState = 'disconnected';
  let _connectedAt:    string | null  = null;
  let _disconnectedAt: string | null  = null;
  let _reconnectCount  = 0;

  function _setState(s: RealtimeState): void {
    _state = s;
  }

  return {
    async connect(): Promise<void> {
      if (_state === 'connected' || _state === 'connecting') return;
      _setState('connecting');
      try {
        await adapter.connect();
        _setState('connected');
        _connectedAt    = now();
        _disconnectedAt = null;
        eventBus.emit(WidgetEvent.REALTIME_CONNECTED, {
          timestamp:     _connectedAt,
          adapterType:   adapter.name,
          reconnectCount: _reconnectCount,
        });
      } catch (err) {
        _setState('failed');
        throw err;
      }
    },

    disconnect(): void {
      if (_state === 'disconnected') return;
      adapter.disconnect();
      _setState('disconnected');
      _disconnectedAt = now();
      eventBus.emit(WidgetEvent.REALTIME_DISCONNECTED, {
        timestamp:   _disconnectedAt,
        adapterType: adapter.name,
        reason:      'manual',
      });
    },

    async reconnect(): Promise<void> {
      if (_state === 'connected') return;
      let attempt = 0;

      while (!policy.shouldStop(attempt)) {
        _setState('reconnecting');
        eventBus.emit(WidgetEvent.REALTIME_RECONNECTING, {
          timestamp: now(),
          attempt,
          delayMs:   policy.nextDelayMs(attempt),
        });

        const delayMs = policy.nextDelayMs(attempt);
        if (delayMs > 0) {
          await new Promise<void>(r => setTimeout(r, delayMs));
        }

        try {
          await adapter.connect();
          _setState('connected');
          _connectedAt    = now();
          _disconnectedAt = null;
          _reconnectCount++;
          eventBus.emit(WidgetEvent.REALTIME_CONNECTED, {
            timestamp:      _connectedAt,
            adapterType:    adapter.name,
            reconnectCount: _reconnectCount,
          });
          return;
        } catch {
          attempt++;
        }
      }
      _setState('failed');
    },

    getStatus(): ConnectionStatus {
      return {
        state:           _state,
        connectedAt:     _connectedAt,
        disconnectedAt:  _disconnectedAt,
        reconnectCount:  _reconnectCount,
      };
    },

    getState(): RealtimeState {
      return _state;
    },
  };
}
