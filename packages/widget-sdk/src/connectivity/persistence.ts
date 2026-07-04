/**
 * connectivity/persistence.ts
 *
 * Persistence abstraction for the offline queue.
 *
 * Implemented:
 *   MemoryPersistence  — in-memory only, lost on page reload
 *
 * Interface-ready for future backends (NOT implemented):
 *   LocalStoragePersistence  — survives page reload, 5–10 MB limit
 *   IndexedDBPersistence     — survives page reload, larger capacity, async
 *
 * Rules:
 *   - No browser storage APIs here
 *   - All persistence is synchronous for now (async abstraction is future work)
 *   - Entries stored by reference — callers must not mutate them
 */

import type { QueuePersistence, PersistedRequest } from './types';

// ─── Memory persistence (current implementation) ────────────────────────────

export class MemoryPersistence implements QueuePersistence {
  readonly name = 'memory';

  private _entries: PersistedRequest[] = [];

  save(entries: PersistedRequest[]): void {
    this._entries = [...entries];
  }

  load(): PersistedRequest[] {
    return [...this._entries];
  }

  clear(): void {
    this._entries = [];
  }
}

// ─── Future persistence stubs (interfaces only) ──────────────────────────────
// These exist to define the contract. Do not implement storage here.

/**
 * @future LocalStoragePersistence
 * Would serialise requests to localStorage as JSON.
 * Not implemented in B.2.7.
 */
export interface LocalStoragePersistenceOptions {
  storageKey?: string;
}

/**
 * @future IndexedDBPersistenceOptions
 * Would use IndexedDB for larger, async offline queue persistence.
 * Not implemented in B.2.7.
 */
export interface IndexedDBPersistenceOptions {
  dbName?:   string;
  storeName?: string;
}
