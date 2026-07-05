/**
 * dashboard/bridge.ts — Dashboard ↔ Runtime bridge.
 *
 * The bridge owns the connection state between the dashboard and the runtime.
 * It coordinates the sync engine and observer, and is the single point of
 * contact for all dashboard → runtime communication.
 *
 * Architecture:
 *   Dashboard
 *     ↓
 *   Bridge (this file)
 *     ↓ push/pull
 *   Sync Engine        ← writes config to ConfigurationService
 *   Observer           ← reads state from runtime
 */

import { createSyncEngine }          from './sync';
import { createObserver }            from './observer';
import { eventBus }                  from '../eventBus';
import { WidgetEvent }               from '../events';
import { LOG_PREFIX }                from '../constants';
import type { ConfigurationService } from '../configuration/service';
import type { WidgetRuntime }        from '../types';
import type {
  DashboardConfig,
  SyncResult,
  ObservedState,
  IBridge,
  ISyncEngine,
  IObserver,
} from './types';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBridge(
  runtime: WidgetRuntime,
  service: ConfigurationService
): IBridge {
  let _connected   = false;
  let _syncEngine: ISyncEngine | null = null;
  let _observer:   IObserver   | null = null;

  function _ensureConnected(): void {
    if (!_connected) {
      throw new Error(`${LOG_PREFIX} Dashboard bridge is not connected`);
    }
  }

  return {
    connect(config?: DashboardConfig): SyncResult {
      if (_connected) {
        console.warn(`${LOG_PREFIX} Dashboard bridge already connected`);
        // If config supplied, apply it as an update
        if (config) return this.push(config);
        return {
          success: true, version: _syncEngine?.version() ?? 0,
          changedFields: [], diff: [], rolledBack: false,
        };
      }

      _syncEngine = createSyncEngine(service);
      _observer   = createObserver(runtime);
      _connected  = true;

      eventBus.emit(WidgetEvent.DASHBOARD_CONNECTED, {
        timestamp: new Date().toISOString(),
        version:   0,
      });

      console.log(`${LOG_PREFIX} Dashboard bridge connected`);

      // Apply initial config if provided
      if (config) {
        return _syncEngine.initialSync(config);
      }

      return {
        success:       true,
        version:       0,
        changedFields: [],
        diff:          [],
        rolledBack:    false,
      };
    },

    disconnect(): void {
      if (!_connected) return;
      _observer?.destroy();
      _observer   = null;
      _syncEngine = null;
      _connected  = false;
      console.log(`${LOG_PREFIX} Dashboard bridge disconnected`);
    },

    push(config: DashboardConfig): SyncResult {
      _ensureConnected();
      return _syncEngine!.apply(config);
    },

    pull(): ObservedState {
      _ensureConnected();
      return _observer!.snapshot();
    },

    isConnected(): boolean {
      return _connected;
    },

    getVersion(): number {
      return _syncEngine?.version() ?? 0;
    },
  };
}
