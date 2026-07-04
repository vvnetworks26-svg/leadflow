/**
 * retry/types.ts
 *
 * All types for the Retry Engine.
 * Pure contracts — no implementation.
 */

import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── Retry reason ─────────────────────────────────────────────────────────────

/**
 * Why a retry is being attempted.
 * Used in events and diagnostics.
 */
export type RetryReason =
  | 'network_error'   // NetworkError — no response received
  | 'timeout'         // TimeoutError — request exceeded timeout
  | 'server_error';   // HttpError with 5xx status (500/502/503/504)

// ─── Retry context ────────────────────────────────────────────────────────────

/**
 * The context passed to the policy on each attempt.
 * Immutable — policies must not mutate it.
 */
export interface RetryContext {
  /** The original request being retried. */
  readonly request:     TransportRequest;
  /** Current attempt number, 1-indexed (1 = first attempt, 2 = first retry, ...). */
  readonly attempt:     number;
  /** The error that caused this retry evaluation. */
  readonly error:       unknown;
  /** ISO-8601 timestamp of the first attempt. */
  readonly startedAt:   string;
  /** Total elapsed ms since the first attempt. */
  readonly elapsedMs:   number;
  /** Why the retry is being considered (classified from the error). */
  readonly reason:      RetryReason | null;
}

// ─── Retry decision ───────────────────────────────────────────────────────────

/**
 * The policy's verdict on whether to retry.
 */
export interface RetryDecision {
  /** True when the engine should retry. */
  shouldRetry: boolean;
  /**
   * How long to wait in milliseconds before the next attempt.
   * Ignored when shouldRetry is false.
   */
  delayMs: number;
  /** Human-readable reason for the decision — for diagnostics only. */
  reason?: string;
}

// ─── Retry result ─────────────────────────────────────────────────────────────

/**
 * The final outcome of a retried execution.
 */
export interface RetryResult<T = unknown> {
  /** The successful response, or null if all attempts failed. */
  response:   TransportResponse<T> | null;
  /** The final error if all attempts were exhausted. Null on success. */
  error:      unknown | null;
  /** Total number of attempts made (1 = no retries). */
  attempts:   number;
  /** Total elapsed ms across all attempts including delays. */
  totalMs:    number;
  /** Whether the final outcome was a success. */
  success:    boolean;
}

// ─── Retry diagnostics ────────────────────────────────────────────────────────

/**
 * Safe point-in-time snapshot of retry engine state.
 * No request payloads, no credentials.
 */
export interface RetryDiagnostics {
  /** Total retry sequences initiated (each submit that needed at least 1 retry). */
  totalRetries:       number;
  /** Sequences that ultimately succeeded after retrying. */
  successfulRetries:  number;
  /** Sequences that exhausted all attempts and failed. */
  failedRetries:      number;
  /** Mean attempts per retried sequence. */
  averageAttempts:    number | null;
  /** Delay used in the most recent retry (ms). Null if no retry has occurred. */
  lastRetryDelay:     number | null;
  /** Name of the currently active policy. */
  activePolicy:       string;
}

// ─── Retry policy interface ───────────────────────────────────────────────────

/**
 * A retry policy decides whether to retry and how long to wait.
 * Policies are stateless — all context is passed via RetryContext.
 */
export interface RetryPolicy {
  /** Human-readable name for diagnostics. */
  readonly name: string;

  /**
   * Evaluate whether the request should be retried.
   * @param ctx - Current retry context.
   * @returns   A RetryDecision with shouldRetry + delayMs.
   */
  evaluate(ctx: RetryContext): RetryDecision;
}

// ─── Retry strategy interface ────────────────────────────────────────────────

/**
 * A retry strategy calculates the delay for a given attempt.
 * Strategies are stateless — all inputs are passed explicitly.
 */
export interface RetryStrategy {
  /** Human-readable name. */
  readonly name: string;

  /**
   * Calculate delay in milliseconds for a given attempt number.
   * @param attempt - 1-indexed attempt number (2 = first retry).
   * @returns Delay in milliseconds.
   */
  calculateDelay(attempt: number): number;
}

// ─── Retry engine interface ──────────────────────────────────────────────────

/**
 * The public interface of the RetryEngine.
 */
export interface IRetryEngine {
  /**
   * Execute a request function with retry logic applied.
   * The executor is called on each attempt.
   */
  execute<T>(
    request:  TransportRequest,
    executor: (request: TransportRequest) => Promise<TransportResponse<T>>
  ): Promise<TransportResponse<T>>;

  /**
   * Evaluate whether an error warrants a retry given the current context.
   */
  shouldRetry(ctx: RetryContext): RetryDecision;

  /**
   * Calculate the delay for the given attempt number using the active strategy.
   */
  calculateDelay(attempt: number): number;

  /** Replace the active policy. */
  setPolicy(policy: RetryPolicy): void;

  /** Returns the active policy. */
  getPolicy(): RetryPolicy;

  /** Returns a safe diagnostics snapshot. */
  getDiagnostics(): RetryDiagnostics;
}
