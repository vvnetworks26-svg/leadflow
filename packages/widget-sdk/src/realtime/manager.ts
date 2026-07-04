/**
 * realtime/manager.ts
 *
 * RealtimeManager singleton + reconnect policies.
 *
 * Reconnect policies:
 *   ImmediateReconnectPolicy  — reconnects instantly, up to maxAttempts
 *   ExponentialReconnectPolicy — placeholder (not implemented)
 *   AdaptiveReconnectPolicy   — placeholder (not implemented)
 *
 * The manager owns:
 *   connection manager, channel manager, heartbeat manager, adapter
 */

import { createMockRealtimeAdapter }  from './adapter';
import { createConnectionManager }    from './connection';
import { createChannelManager }       from './channels';
import { createHeartbeatManager }     from './heartbeat';
import type {
  IRealtimeManager,
  RealtimeAdapter,
  RealtimeDiagnostics,
  ConnectionStatus,
  MessageHandler,
  Subscription,
  ReconnectPolicy,
} from './types';

// ─── Reconnect policies ───────────────────────────────────────────────────────

export class ImmediateReconnectPolicy implements ReconnectPolicy {
  readonly name = 'immediate';
  private readonly _maxAttempts: number;
  constructor(maxAttempts = 5) { this._maxAttempts = maxAttempts; }
  nextDelayMs(_attempt: number): number { return 0; }
  shouldStop(attempt: number): boolean  { return attempt >= this._maxAttempts; }
}

/** @future Not implemented — interface placeholder. */
export class ExponentialReconnectPolicy implements ReconnectPolicy {
  readonly name = 'exponential';
  nextDelayMs(_attempt: number): number { throw new Error('ExponentialReconnectPolicy not implemented'); }
  shouldStop(_attempt: number): boolean  { throw new Error('ExponentialReconnectPolicy not implemented'); }
}

/** @future Not implemented — interface placeholder. */
export class AdaptiveReconnectPolicy implements ReconnectPolicy {
  readonly name = 'adaptive';
  nextDelayMs(_attempt: number): number { throw new Error('AdaptiveReconnectPolicy not implemented'); }
  shouldStop(_attempt: number): boolean  { throw new Error('AdaptiveReconnectPolicy not implemented'); }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createRealtimeManager(
  adapter?: RealtimeAdapter,
  policy?:  ReconnectPolicy
): IRealtimeManager {
  const _adapter   = adapter ?? createMockRealtimeAdapter();
  const _policy    = policy  ?? new ImmediateReconnectPolicy();
  const _conn      = createConnectionManager(_adapter, _policy);
  const _channels  = createChannelManager(_adapter);
  const _heartbeat = createHeartbeatManager();

  return {
    async connect(): Promise<void> {
      await _conn.connect();
      _heartbeat.start();
    },

    disconnect(): void {
      _heartbeat.stop();
      _channels.dispose();
      _conn.disconnect();
    },

    subscribe(channel: string, handler: MessageHandler): Subscription {
      return _channels.subscribe(channel, handler);
    },

    unsubscribe(subscriptionId: string): void {
      _channels.unsubscribe(subscriptionId);
    },

    publish(channel: string, event: string, data: Record<string, unknown>): void {
      _channels.publish(channel, event, data);
    },

    broadcast(channel: string, event: string, data: Record<string, unknown>): void {
      _channels.broadcast(channel, event, data);
    },

    getStatus(): ConnectionStatus {
      return _conn.getStatus();
    },

    getDiagnostics(): RealtimeDiagnostics {
      const status = _conn.getStatus();
      const hb     = _heartbeat.getStats();
      return {
        connectionStatus: status.state,
        connectedAt:      status.connectedAt,
        reconnectCount:   status.reconnectCount,
        heartbeatCount:   hb.sent,
        subscriptions:    _channels.activeSubscriptions(),
        adapterType:      _adapter.name,
      };
    },
  };
}
