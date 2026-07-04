/**
 * realtime/channels.ts
 *
 * Channel manager — multiplexes messages across named channels.
 * Each channel has independent subscribers.
 * The adapter's onMessage callback routes incoming messages to the right channel.
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type {
  RealtimeAdapter,
  Subscription,
  MessageHandler,
  RealtimeMessage,
} from './types';

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

// ─── Channel implementation ───────────────────────────────────────────────────

export interface ChannelManager {
  subscribe(channel: string, handler: MessageHandler): Subscription;
  unsubscribe(subscriptionId: string): void;
  publish(channel: string, event: string, data: Record<string, unknown>): void;
  broadcast(channel: string, event: string, data: Record<string, unknown>): void;
  activeSubscriptions(): string[];
  dispose(): void;
}

export function createChannelManager(adapter: RealtimeAdapter): ChannelManager {
  // channel name → Map of subscriptionId → handler
  const _subs = new Map<string, Map<string, MessageHandler>>();
  // subscriptionId → channel name (for O(1) unsubscribe by ID)
  const _index = new Map<string, string>();

  // Wire adapter message delivery to channel routing
  const _onAdapterMessage = (msg: RealtimeMessage): void => {
    const handlers = _subs.get(msg.channel);
    if (!handlers) return;
    for (const handler of handlers.values()) {
      try { handler(msg); } catch { /* isolate */ }
    }
    eventBus.emit(WidgetEvent.REALTIME_MESSAGE, {
      timestamp: msg.timestamp,
      channel:   msg.channel,
      event:     msg.event,
      messageId: msg.id,
    });
  };
  adapter.onMessage(_onAdapterMessage);

  return {
    subscribe(channel: string, handler: MessageHandler): Subscription {
      if (!_subs.has(channel)) _subs.set(channel, new Map());
      const id = uuid();
      _subs.get(channel)!.set(id, handler);
      _index.set(id, channel);

      eventBus.emit(WidgetEvent.REALTIME_SUBSCRIBED, {
        timestamp: new Date().toISOString(),
        channel,
        subscriptionId: id,
      });

      const sub: Subscription = {
        id,
        channel,
        handler,
        createdAt: new Date().toISOString(),
        unsubscribe: () => this.unsubscribe(id),
      };
      return sub;
    },

    unsubscribe(subscriptionId: string): void {
      const channel = _index.get(subscriptionId);
      if (!channel) return;
      _subs.get(channel)?.delete(subscriptionId);
      if (_subs.get(channel)?.size === 0) _subs.delete(channel);
      _index.delete(subscriptionId);

      eventBus.emit(WidgetEvent.REALTIME_UNSUBSCRIBED, {
        timestamp: new Date().toISOString(),
        channel,
        subscriptionId,
      });
    },

    publish(channel: string, event: string, data: Record<string, unknown>): void {
      // Local publish — delivers directly to channel subscribers
      adapter.send(channel, event, data);
    },

    broadcast(channel: string, event: string, data: Record<string, unknown>): void {
      // Broadcast — same as publish for mock adapter; future: fan-out to server
      adapter.send(channel, event, data);
    },

    activeSubscriptions(): string[] {
      return Array.from(_subs.keys());
    },

    dispose(): void {
      adapter.offMessage(_onAdapterMessage);
      _subs.clear();
      _index.clear();
    },
  };
}
