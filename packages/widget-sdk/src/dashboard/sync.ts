/**
 * dashboard/sync.ts — Sync Engine.
 *
 * Owns the configuration synchronization lifecycle:
 *   initialSync() — first-time apply of dashboard config
 *   apply()       — incremental apply (computes diff, applies changes)
 *   refresh()     — re-apply the last known config (idempotent)
 *   rollback()    — revert to the previous config snapshot
 *   version()     — current sync version counter
 *   getState()    — full SyncState snapshot
 *
 * No networking — operates purely on the ConfigurationService.
 */

import { applyDashboardConfig, computeDiff, revertDashboardConfig } from './config';
import { eventBus }                   from '../eventBus';
import { WidgetEvent }                from '../events';
import { LOG_PREFIX }                 from '../constants';
import type { ConfigurationService }  from '../configuration/service';
import type {
  DashboardConfig,
  SyncResult,
  SyncState,
  SyncStatus,
  ISyncEngine,
} from './types';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSyncEngine(service: ConfigurationService): ISyncEngine {
  let _version          = 0;
  let _status:   SyncStatus = 'idle';
  let _lastSync: string | null = null;
  let _error:    string | null = null;

  /** The last dashboard config successfully applied. */
  let _current:  DashboardConfig | null = null;
  /** The config snapshot before the last apply — used for rollback. */
  let _previous: DashboardConfig | null = null;
  /** Fields applied by the last dashboard config. */
  let _appliedFields: string[] = [];

  function _doApply(config: DashboardConfig): SyncResult {
    const ts = new Date().toISOString();
    _status = 'syncing';

    eventBus.emit(WidgetEvent.CONFIG_SYNC_STARTED, {
      timestamp: ts,
      version:   _version + 1,
    });

    try {
      // Snapshot before apply
      const resolvedBefore = service.getResolvedConfig();
      const diff = computeDiff(resolvedBefore, config);

      // Apply
      _appliedFields = applyDashboardConfig(service, config);

      _version++;
      _status    = 'synced';
      _lastSync  = new Date().toISOString();
      _error     = null;

      const changed = diff.map(d => d.field as string);

      if (changed.length > 0) {
        eventBus.emit(WidgetEvent.CONFIG_CHANGED, {
          timestamp:     _lastSync,
          version:       _version,
          changedFields: changed,
          diff:          diff.map(d => ({
            field:    d.field as string,
            previous: d.previous ?? null,
            current:  d.current,
          })),
        });
      }

      eventBus.emit(WidgetEvent.CONFIG_SYNC_COMPLETED, {
        timestamp:     _lastSync,
        version:       _version,
        changedFields: changed,
      });

      return {
        success:       true,
        version:       _version,
        changedFields: changed,
        diff,
        rolledBack:    false,
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      _status = 'failed';
      _error  = msg;
      console.error(`${LOG_PREFIX} Dashboard sync failed:`, msg);

      return {
        success:       false,
        version:       _version,
        changedFields: [],
        diff:          [],
        rolledBack:    false,
        error:         msg,
      };
    }
  }

  return {

    initialSync(config: DashboardConfig): SyncResult {
      _previous = null;
      _current  = config;
      return _doApply(config);
    },

    apply(config: DashboardConfig): SyncResult {
      _previous         = _current;
      _current          = config;
      return _doApply(config);
    },

    refresh(): SyncResult {
      if (!_current) {
        return {
          success:       false,
          version:       _version,
          changedFields: [],
          diff:          [],
          rolledBack:    false,
          error:         'No config to refresh — call initialSync() or apply() first',
        };
      }
      return _doApply(_current);
    },

    rollback(): SyncResult {
      if (!_previous) {
        return {
          success:       false,
          version:       _version,
          changedFields: [],
          diff:          [],
          rolledBack:    false,
          error:         'No previous config available for rollback',
        };
      }

      const toRestore = _previous;
      _previous = null;

      // Revert current fields then apply the previous config
      revertDashboardConfig(service, _appliedFields);
      _current = toRestore;

      const result = _doApply(toRestore);

      if (result.success) {
        _status = 'rolled-back';
        eventBus.emit(WidgetEvent.CONFIG_ROLLBACK, {
          timestamp: new Date().toISOString(),
          version:   _version,
        });
        return { ...result, rolledBack: true };
      }

      return result;
    },

    version(): number {
      return _version;
    },

    canRollback(): boolean {
      return _previous !== null;
    },

    getState(): SyncState {
      return {
        status:            _status,
        version:           _version,
        lastSync:          _lastSync,
        pendingUpdates:    0,   // no network — always 0
        rollbackAvailable: _previous !== null,
        error:             _error,
      };
    },
  };
}
