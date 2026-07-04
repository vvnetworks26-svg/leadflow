/**
 * connectivity/types.ts
 *
 * All types for the Connectivity Manager.
 * Pure contracts — no implementation.
 */

import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── Connectivity state ───────────────────────────────────────────────────────

/** Current connectivity status. */
export type ConnectivityState = 'online' | 'offline' | 'unknown';

/** Describes the connectivity status with timestamp metadata. */
export interface ConnectivityStatus {
  /** Current state. */
  state:           ConnectivityState;
  /** ISO-8601 timestamp of the last state change. Null on first access. */
  lastChangedAt:   string | null;
  /** ISO-8601 timestamp of the last time we detected coming back online. Null if never. */
  lastReconnectAt: string | null;
}

// ─── Persisted request ───────────────────────────────────────────────────────

/**
 * An immutable entry in the offline queue.
 * Wraps a TransportRequest with deferred promise handles.
 */
export interface PersistedRequest<T = unknown> {
  /** Unique ID for this offline queue entry. */
  readonly entryId:    string;
  /** The original request. */
  readonly request:    TransportRequest;
  /** ISO-8601 timestamp when the request was deferred. */
  readonly deferredAt: string;
  /** Resolve the caller's promise on successful replay. */
  readonly resolve:    (response: TransportResponse<T>) => void;
  /** Reject the caller's promise if replay fails. */
  readonly reject:     (error: unknown) => void;
}

// ─── Connectivity diagnostics ─────────────────────────────────────────────────

export interface ConnectivityDiagnostics {
  /** Current connectivity state. */
  online:             boolean;
  /** Number of requests currently in the offline queue. */
  offlineQueueLength: number;
  /** Total requests that were deferred due to offline state. */
  deferredRequests:   number;
  /** Total requests successfully replayed after reconnection. */
  replayedRequests:   number;
  /** Total replay attempts that ultimately failed. */
  failedReplays:      number;
  /** ISO-8601 timestamp of the last successful reconnection. Null if never reconnected. */
  lastReconnect:      string | null;
}

// ─── Offline queue interface ─────────────────────────────────────────────────

export interface OfflineQueue {
  enqueue(entry: PersistedRequest): void;
  dequeue(): PersistedRequest | null;
  peek(): PersistedRequest | null;
  clear(): void;
  size(): number;
  isEmpty(): boolean;
  snapshot(): ReadonlyArray<PersistedRequest>;
}

// ─── Persistence abstraction ─────────────────────────────────────────────────

/**
 * Storage backend for the offline queue.
 * Current implementation: MemoryPersistence.
 * Future: LocalStoragePersistence, IndexedDBPersistence.
 */
export interface QueuePersistence {
  /** Human-readable name for diagnostics. */
  readonly name: string;
  save(entries: PersistedRequest[]): void;
  load(): PersistedRequest[];
  clear(): void;
}

// ─── Connectivity monitor interface ──────────────────────────────────────────

export interface ConnectivityMonitor {
  /** Returns true when the browser reports an active connection. */
  isOnline(): boolean;

  /** Returns the current full status. */
  status(): ConnectivityStatus;

  /**
   * Subscribe to connectivity changes.
   * Callback receives the new state.
   * @returns Unsubscribe function.
   */
  subscribe(callback: (state: ConnectivityState) => void): () => void;

  /** Unsubscribe a registered callback. No-op if not registered. */
  unsubscribe(callback: (state: ConnectivityState) => void): void;

  /** Dispose event listeners. Must be called on cleanup. */
  dispose(): void;
}

// ─── Connectivity manager interface ──────────────────────────────────────────

export interface IConnectivityManager {
  /**
   * Submit a request.
   * If online → forward to orchestrator immediately.
   * If offline → enqueue in the offline queue; resolves/rejects when replayed.
   */
  submit<T>(request: TransportRequest): Promise<TransportResponse<T>>;

  /**
   * Flush all deferred requests from the offline queue through the orchestrator.
   * Called automatically on reconnection. Can also be called manually.
   */
  flush(): Promise<void>;

  /** Pause replay processing. Offline queue still accepts new requests. */
  pause(): void;

  /** Resume replay processing. If online, flushes the queue immediately. */
  resume(): void;

  /** Cancel and remove all queued offline requests. */
  clear(): void;

  /** Returns true when the device is currently online. */
  isOnline(): boolean;

  /** Returns a safe diagnostics snapshot. */
  getDiagnostics(): ConnectivityDiagnostics;
}
