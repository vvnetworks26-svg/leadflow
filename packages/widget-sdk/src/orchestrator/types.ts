/**
 * orchestrator/types.ts
 *
 * All types for the Request Orchestrator layer.
 * No implementation — pure contracts.
 */

import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── Request priority ─────────────────────────────────────────────────────────

/**
 * Request priority levels.
 * Currently all requests are NORMAL — this type exists to support
 * future PriorityScheduler without interface changes.
 */
export type RequestPriority = 'low' | 'normal' | 'high';

// ─── Request state ────────────────────────────────────────────────────────────

/** Lifecycle state of a queued request. */
export type RequestState =
  | 'queued'      // waiting in the queue
  | 'processing'  // currently being sent via transport
  | 'completed'   // transport.send() resolved
  | 'cancelled'   // removed before processing
  | 'failed';     // transport.send() rejected

// ─── Queued request ───────────────────────────────────────────────────────────

/**
 * An immutable entry in the orchestrator queue.
 * Wraps a TransportRequest with queue-level metadata.
 */
export interface QueuedRequest<T = unknown> {
  /** Unique ID for this queue entry (distinct from the transport request ID). */
  readonly queueId:      string;
  /** The underlying transport request. */
  readonly request:      TransportRequest;
  /** ISO-8601 timestamp when the request was submitted. */
  readonly enqueuedAt:   string;
  /** Current lifecycle state. */
  readonly state:        RequestState;
  /** Priority hint for future schedulers. */
  readonly priority:     RequestPriority;
  /** Promise resolve/reject handles — used by the orchestrator to settle the caller's promise. */
  readonly resolve:      (response: TransportResponse<T>) => void;
  readonly reject:       (error: unknown) => void;
}

// ─── Queue statistics ─────────────────────────────────────────────────────────

/** Point-in-time queue stats — safe for diagnostics. */
export interface QueueStatistics {
  /** Number of requests currently in the queue. */
  length:            number;
  /** Total requests ever enqueued since last clear(). */
  totalEnqueued:     number;
  /** Total requests dequeued (processed or cancelled) since last clear(). */
  totalDequeued:     number;
}

// ─── Orchestrator diagnostics ─────────────────────────────────────────────────

/** Safe diagnostic snapshot for the orchestrator. No payloads, no credentials. */
export interface OrchestratorDiagnostics {
  /** Number of requests currently waiting in the queue. */
  queueLength:          number;
  /** Total requests successfully completed. */
  processedRequests:    number;
  /** Number of requests currently queued (alias of queueLength). */
  pendingRequests:      number;
  /** Whether the orchestrator is paused. */
  paused:               boolean;
  /** Name of the active scheduler. */
  schedulerType:        string;
  /**
   * Average time in milliseconds a request spent in the queue before
   * processing began. Null until at least one request has been processed.
   */
  averageQueueTime:     number | null;
}

// ─── Scheduler interface ──────────────────────────────────────────────────────

/**
 * The scheduler decides the order in which queued requests are processed.
 *
 * Current implementation: FIFOScheduler (insertion order).
 *
 * Interface is designed to support future variants without changing
 * the orchestrator:
 *   - PriorityScheduler  — dequeue by priority then FIFO within priority
 *   - WeightedScheduler  — dequeue by weight
 *   - FairScheduler      — round-robin across priority buckets
 */
export interface Scheduler {
  /** Human-readable name for diagnostics. */
  readonly name: string;

  /** Add a request to the scheduler's internal store. */
  enqueue(entry: QueuedRequest): void;

  /**
   * Remove and return the next request according to this scheduler's ordering.
   * Returns null when the store is empty.
   */
  dequeue(): QueuedRequest | null;

  /** Return the next request without removing it. Null when empty. */
  peek(): QueuedRequest | null;

  /** Remove all pending entries. */
  clear(): void;

  /** Number of pending entries. */
  size(): number;

  /** True when no pending entries exist. */
  isEmpty(): boolean;

  /** Return a snapshot of all pending entries in processing order. */
  getSnapshot(): ReadonlyArray<QueuedRequest>;
}

// ─── Orchestrator interface ───────────────────────────────────────────────────

/** The public interface of the RequestOrchestrator. */
export interface IRequestOrchestrator {
  /**
   * Submit a request for orchestrated execution.
   * Returns a Promise that resolves/rejects when the request completes.
   */
  submit<T>(request: TransportRequest): Promise<TransportResponse<T>>;

  /** Process the next queued request immediately (bypasses pause). For internal use. */
  processNext(): Promise<void>;

  /** Process all queued requests sequentially until the queue is empty. */
  drain(): Promise<void>;

  /** Pause processing. Requests can still be enqueued but will not be sent. */
  pause(): void;

  /** Resume processing and immediately process any pending requests. */
  resume(): void;

  /** Clear all queued (not yet processing) requests. */
  clear(): void;

  /** Returns true when the orchestrator is paused. */
  isPaused(): boolean;

  /** Returns a safe diagnostics snapshot. */
  getDiagnostics(): OrchestratorDiagnostics;
}
