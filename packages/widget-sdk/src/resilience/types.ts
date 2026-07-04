/**
 * resilience/types.ts
 *
 * All types for the Resilience Layer.
 * Pure contracts — no implementation.
 */

import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── Timeout policy ───────────────────────────────────────────────────────────

/**
 * How timeout is applied to a request.
 * 'none'     — no timeout (run forever)
 * 'default'  — use the manager's configured default timeout
 * 'custom'   — use a per-request override in ms
 */
export type TimeoutMode = 'none' | 'default' | 'custom';

export interface TimeoutPolicy {
  mode:         TimeoutMode;
  /** Timeout in ms. Used when mode is 'default' or 'custom'. 0 = no timeout. */
  timeoutMs:    number;
}

// ─── Deadline ─────────────────────────────────────────────────────────────────

/**
 * An absolute deadline — a point in time after which the request must not
 * proceed. Created from either an absolute timestamp or a relative duration.
 */
export interface Deadline {
  /** Absolute deadline as ms since Unix epoch (Date.now() format). */
  readonly expiresAt: number;

  /** True when the current time has passed the deadline. */
  isExpired(): boolean;

  /** Remaining milliseconds until the deadline. 0 if already expired. */
  remainingMs(): number;

  /** ISO-8601 string of the deadline time. For diagnostics only. */
  toISOString(): string;
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

/**
 * A read-only view of a cancellation token.
 * Consumers subscribe to know when cancellation happens.
 * Only the CancellationSource that created it can cancel.
 */
export interface CancellationToken {
  /** True when cancel() has been called on the source. */
  readonly isCancelled: boolean;

  /** The reason string passed to cancel(), or null. */
  readonly reason: string | null;

  /**
   * Subscribe to cancellation.
   * The callback fires synchronously when cancel() is called,
   * or immediately if already cancelled.
   * @returns An unsubscribe function.
   */
  subscribe(callback: (reason: string | null) => void): () => void;

  /**
   * Unsubscribe a previously registered callback.
   * No-op if the callback was not registered.
   */
  unsubscribe(callback: (reason: string | null) => void): void;

  /**
   * Return a native AbortSignal backed by this token.
   * Aborted automatically when this token is cancelled.
   */
  toAbortSignal(): AbortSignal;
}

/**
 * Controls a CancellationToken.
 * Only the holder of the CancellationSource may cancel.
 */
export interface CancellationSource {
  /** The token to distribute to consumers. */
  readonly token: CancellationToken;

  /**
   * Cancel all operations associated with this source.
   * @param reason - Optional human-readable reason.
   */
  cancel(reason?: string): void;
}

// ─── Resilience context ───────────────────────────────────────────────────────

/**
 * The full resilience context created for each request.
 * Holds all lifecycle resources for one request execution.
 */
export interface ResilienceContext {
  /** Unique ID for this context — correlates events and diagnostics. */
  readonly contextId:         string;
  /** The original request this context is managing. */
  readonly request:           TransportRequest;
  /** The effective timeout policy for this request. */
  readonly timeoutPolicy:     TimeoutPolicy;
  /** Optional deadline. Null if none was set. */
  readonly deadline:          Deadline | null;
  /** Cancellation token available to the executor. */
  readonly cancellationToken: CancellationToken;
  /** The effective AbortSignal merging timeout, deadline, and cancellation. */
  readonly signal:            AbortSignal;
  /** ISO-8601 timestamp when the context was created. */
  readonly createdAt:         string;
  /** Whether dispose() has been called. */
  readonly disposed:          boolean;

  /**
   * Dispose all resources: clear timers, abort if timed out, unsubscribe listeners.
   * Safe to call multiple times.
   */
  dispose(): void;
}

// ─── Resilience diagnostics ───────────────────────────────────────────────────

export interface ResilienceDiagnostics {
  /** Number of contexts currently alive (not yet disposed). */
  activeContexts:    number;
  /** Total timeouts triggered since manager creation. */
  timeoutsTriggered: number;
  /** Total deadlines that expired. */
  deadlinesExpired:  number;
  /** Total requests cancelled via CancellationSource.cancel(). */
  cancelledRequests: number;
  /**
   * Average lifetime of disposed contexts in milliseconds.
   * Null until at least one context has been disposed.
   */
  averageLifetime:   number | null;
}

// ─── Resilience manager interface ────────────────────────────────────────────

export interface IResilienceManager {
  /**
   * Create a ResilienceContext for a request.
   * Applies timeout and optional deadline; returns a context with a merged signal.
   *
   * @param request      - The request to wrap.
   * @param timeoutMs    - Per-request timeout override. 0 = use default. -1 = no timeout.
   * @param deadlineMs   - Optional relative deadline in ms from now. 0 = no deadline.
   */
  createContext(
    request:    TransportRequest,
    timeoutMs?: number,
    deadlineMs?: number
  ): ResilienceContext;

  /**
   * Wrap a request executor with resilience management.
   * Creates a context, injects the merged AbortSignal, disposes the context after execution.
   *
   * @param request   - The original request.
   * @param executor  - The function that actually sends the request.
   * @param timeoutMs - Optional per-request timeout override.
   */
  wrapRequest<T>(
    request:   TransportRequest,
    executor:  (req: TransportRequest) => Promise<TransportResponse<T>>,
    timeoutMs?: number
  ): Promise<TransportResponse<T>>;

  /** Set the default timeout in ms. 0 = no timeout. */
  setDefaultTimeout(ms: number): void;

  /** Returns the current default timeout in ms. */
  getDefaultTimeout(): number;

  /** Dispose all active contexts immediately. */
  dispose(): void;

  /** Returns a safe diagnostics snapshot. */
  getDiagnostics(): ResilienceDiagnostics;
}
