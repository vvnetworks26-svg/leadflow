/**
 * connectivity/queue.ts
 *
 * FIFO offline queue — stores deferred requests while the device is offline.
 * Independent of the orchestrator queue.
 * Backed by a QueuePersistence implementation.
 */

import type { OfflineQueue, PersistedRequest, QueuePersistence } from './types';

export function createOfflineQueue(persistence: QueuePersistence): OfflineQueue {
  // Load any previously persisted entries on startup
  let _items: PersistedRequest[] = persistence.load();

  function _save(): void {
    persistence.save(_items);
  }

  return {
    enqueue(entry: PersistedRequest): void {
      _items.push(entry);
      _save();
    },

    dequeue(): PersistedRequest | null {
      if (_items.length === 0) return null;
      const entry = _items.shift()!;
      _save();
      return entry;
    },

    peek(): PersistedRequest | null {
      return _items[0] ?? null;
    },

    clear(): void {
      _items = [];
      _save();
    },

    size(): number {
      return _items.length;
    },

    isEmpty(): boolean {
      return _items.length === 0;
    },

    snapshot(): ReadonlyArray<PersistedRequest> {
      return Object.freeze([..._items]);
    },
  };
}
