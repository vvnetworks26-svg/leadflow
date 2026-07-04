/**
 * realtime/adapter.ts
 *
 * Realtime adapter abstraction + MockRealtimeAdapter.
 *
 * MockRealtimeAdapter:
 *   - connect()    → resolves immediately, no network
 *   - disconnect() → no-op
 *   - send()       → delivers message to local onMessage handlers
 *   - Configurable latency
 *
 * Future adapters (NOT implemented — interface only):
 *   WebSocketAdapter    — browser WebSocket
 *   SSEAdapter          — server-sent events
 *   WebTransportAdapter — WebTransport API
 */

import type { RealtimeAdapter, RealtimeMessage } from './types';

// ─── UUID ─────────────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Mock Adapter ─────────────────────────────────────────────────────────────

export interface MockAdapterOptions {
  /** Artificial connect delay in ms. Default 0. */
  connectDelayMs?: number;
  /** Whether connect() should fail. Default false. */
  failOnConnect?: boolean;
}

export function createMockRealtimeAdapter(opts: MockAdapterOptions = {}): RealtimeAdapter {
  let _connected = false;
  const _handlers: Set<(msg: RealtimeMessage) => void> = new Set();

  const delay = (ms: number) =>
    ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve();

  return {
    name: 'mock',

    async connect(): Promise<void> {
      await delay(opts.connectDelayMs ?? 0);
      if (opts.failOnConnect) {
        throw new Error('MockRealtimeAdapter: connect failed (failOnConnect=true)');
      }
      _connected = true;
    },

    disconnect(): void {
      _connected = false;
    },

    send(channel: string, event: string, data: Record<string, unknown>): void {
      if (!_connected) return;
      const msg: RealtimeMessage = Object.freeze({
        channel,
        event,
        data:      Object.freeze({ ...data }),
        timestamp: new Date().toISOString(),
        id:        uuid(),
      });
      // Deliver synchronously to all registered handlers
      for (const handler of _handlers) {
        try { handler(msg); } catch { /* isolate */ }
      }
    },

    onMessage(handler: (msg: RealtimeMessage) => void): void {
      _handlers.add(handler);
    },

    offMessage(handler: (msg: RealtimeMessage) => void): void {
      _handlers.delete(handler);
    },

    isConnected(): boolean {
      return _connected;
    },
  };
}

/** The default singleton mock adapter used when no other is configured. */
export const mockRealtimeAdapter = createMockRealtimeAdapter();
