/**
 * connectivity/manager.ts
 *
 * ConnectivityManager — routes requests based on online/offline state.
 *
 * When online:  submit() → orchestrator.submit() immediately
 * When offline: submit() → offline queue → caller's Promise deferred
 * On reconnect: flush() → drain offline queue through orchestrator
 *
 * Rules:
 *   - No transport changes
 *   - No retries here (retry engine handles that downstream)
 *   - Memory persistence only (no browser storage)
 *   - FIFO replay order
 */

import { createConnectivityMonitor }  from './monitor';
import { createOfflineQueue }         from './queue';
import { MemoryPersistence }          from './persistence';
import { eventBus }                   from '../eventBus';
import { WidgetEvent }                from '../events';
import type {
  IConnectivityManager,
  ConnectivityDiagnostics,
  PersistedRequest,
} from './types';
import type { IRequestOrchestrator } from '../orchestrator/types';
import type { TransportRequest, TransportResponse } from '../transport/types';

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

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createConnectivityManager(
  orchestrator: IRequestOrchestrator
): IConnectivityManager {
  const _monitor     = createConnectivityMonitor();
  const _persistence = new MemoryPersistence();
  const _queue       = createOfflineQueue(_persistence);

  let _paused            = false;
  let _flushing          = false;
  let _deferredRequests  = 0;
  let _replayedRequests  = 0;
  let _failedReplays     = 0;
  let _lastReconnect:    string | null = null;

  // ── Listen for reconnection ───────────────────────────────────────────────
  _monitor.subscribe((state) => {
    if (state === 'online') {
      _lastReconnect = new Date().toISOString();

      eventBus.emit(WidgetEvent.CONNECTIVITY_ONLINE, {
        timestamp:   _lastReconnect,
        queueLength: _queue.size(),
      });

      // Flush deferred requests unless paused
      if (!_paused && !_queue.isEmpty()) {
        Promise.resolve().then(() => _manager.flush());
      }
    } else if (state === 'offline') {
      eventBus.emit(WidgetEvent.CONNECTIVITY_OFFLINE, {
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Internal flush implementation ─────────────────────────────────────────
  async function _flush(): Promise<void> {
    if (_flushing || _queue.isEmpty()) return;
    _flushing = true;

    const total = _queue.size();

    eventBus.emit(WidgetEvent.QUEUE_REPLAY_STARTED, {
      timestamp:   new Date().toISOString(),
      queueLength: total,
    });

    let replayed = 0;
    let failed   = 0;

    while (!_queue.isEmpty() && !_paused) {
      const entry = _queue.dequeue();
      if (!entry) break;

      try {
        const response = await orchestrator.submit(entry.request);
        (entry as PersistedRequest<typeof response.body>).resolve(
          response as TransportResponse<typeof response.body>
        );
        _replayedRequests++;
        replayed++;
      } catch (err) {
        (entry as PersistedRequest).reject(err);
        _failedReplays++;
        failed++;
      }
    }

    _flushing = false;

    if (failed === 0) {
      eventBus.emit(WidgetEvent.QUEUE_REPLAY_COMPLETED, {
        timestamp:        new Date().toISOString(),
        replayedRequests: replayed,
      });
    } else {
      eventBus.emit(WidgetEvent.QUEUE_REPLAY_FAILED, {
        timestamp:        new Date().toISOString(),
        replayedRequests: replayed,
        failedRequests:   failed,
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const _manager: IConnectivityManager = {
    submit<T>(request: TransportRequest): Promise<TransportResponse<T>> {
      // Online path: forward directly
      if (_monitor.isOnline()) {
        return orchestrator.submit<T>(request);
      }

      // Offline path: defer to queue
      _deferredRequests++;

      let resolve!: (response: TransportResponse<T>) => void;
      let reject!:  (error: unknown) => void;
      const promise = new Promise<TransportResponse<T>>((res, rej) => {
        resolve = res;
        reject  = rej;
      });

      const entry: PersistedRequest<T> = Object.freeze({
        entryId:    uuid(),
        request,
        deferredAt: new Date().toISOString(),
        resolve,
        reject,
      });

      _queue.enqueue(entry as PersistedRequest);

      eventBus.emit(WidgetEvent.REQUEST_DEFERRED, {
        timestamp:   new Date().toISOString(),
        requestId:   request.id,
        entryId:     entry.entryId,
        queueLength: _queue.size(),
      });

      return promise;
    },

    async flush(): Promise<void> {
      await _flush();
    },

    pause(): void {
      _paused = true;
    },

    resume(): void {
      _paused = false;
      if (_monitor.isOnline() && !_queue.isEmpty()) {
        Promise.resolve().then(() => _flush());
      }
    },

    clear(): void {
      const snapshot = _queue.snapshot();
      _queue.clear();
      for (const entry of snapshot) {
        entry.reject(new Error('Offline queue cleared'));
      }
    },

    isOnline(): boolean {
      return _monitor.isOnline();
    },

    getDiagnostics(): ConnectivityDiagnostics {
      return {
        online:             _monitor.isOnline(),
        offlineQueueLength: _queue.size(),
        deferredRequests:   _deferredRequests,
        replayedRequests:   _replayedRequests,
        failedReplays:      _failedReplays,
        lastReconnect:      _lastReconnect,
      };
    },
  };

  return _manager;
}
