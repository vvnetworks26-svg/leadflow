/**
 * realtime/heartbeat.ts
 *
 * Heartbeat manager — tracks sent/received heartbeat counts.
 *
 * Rules:
 *   - No timers longer than necessary (heartbeat ticks are driven externally)
 *   - start() / stop() toggle active state
 *   - tick() increments the sent counter and emits HEARTBEAT_SENT
 *   - receive() increments the received counter and emits HEARTBEAT_RECEIVED
 *   - All state is in-memory — no persistence
 */

import { eventBus }    from '../eventBus';
import { WidgetEvent } from '../events';
import type { HeartbeatStats } from './types';

export interface HeartbeatManager {
  start(): void;
  stop(): void;
  tick(): void;
  receive(): void;
  isActive(): boolean;
  getStats(): HeartbeatStats;
}

export function createHeartbeatManager(): HeartbeatManager {
  let _active         = false;
  let _sent           = 0;
  let _received       = 0;
  let _lastSentAt:    string | null = null;
  let _lastReceivedAt: string | null = null;

  return {
    start(): void {
      _active = true;
    },

    stop(): void {
      _active = false;
    },

    tick(): void {
      if (!_active) return;
      _sent++;
      _lastSentAt = new Date().toISOString();
      eventBus.emit(WidgetEvent.HEARTBEAT_SENT, {
        timestamp: _lastSentAt,
        count:     _sent,
      });
    },

    receive(): void {
      _received++;
      _lastReceivedAt = new Date().toISOString();
      eventBus.emit(WidgetEvent.HEARTBEAT_RECEIVED, {
        timestamp: _lastReceivedAt,
        count:     _received,
      });
    },

    isActive(): boolean {
      return _active;
    },

    getStats(): HeartbeatStats {
      return {
        sent:           _sent,
        received:       _received,
        lastSentAt:     _lastSentAt,
        lastReceivedAt: _lastReceivedAt,
      };
    },
  };
}
