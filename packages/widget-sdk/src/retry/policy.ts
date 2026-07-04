/**
 * retry/policy.ts
 *
 * Retry policies — decide whether to retry and delegate delay to a strategy.
 *
 * Implemented:
 *   NoRetryPolicy            — never retries
 *   FixedRetryPolicy         — retries up to N times with fixed delay
 *   ExponentialBackoffPolicy — retries up to N times with exponential backoff
 *
 * Placeholders (interface-compatible stubs, not yet implemented):
 *   AdaptiveRetryPolicy      — would adjust based on response codes / latency
 *   CircuitBreakerPolicy     — would open/close based on failure rate
 *
 * Retry conditions (shared across all non-trivial policies):
 *   RETRY:   NetworkError, TimeoutError, HTTP 500/502/503/504
 *   NO RETRY: AbortError, ValidationError, HTTP 400/401/403/404/422
 */

import {
  FixedDelayStrategy,
  ExponentialBackoffStrategy,
} from './strategies';
import type {
  ExponentialBackoffOptions,
  FixedDelayOptions,
} from './strategies';
import type { RetryPolicy, RetryContext, RetryDecision, RetryReason } from './types';

// ─── Retry condition classifier ───────────────────────────────────────────────

/**
 * Classify an error into a RetryReason, or null if not retryable.
 *
 * Retryable:
 *   - NetworkError (no response)
 *   - TimeoutError
 *   - HttpError with status 500, 502, 503, 504
 *
 * Not retryable:
 *   - AbortError (intentional cancellation)
 *   - ValidationError (malformed request — won't succeed on retry)
 *   - HttpError with 4xx status
 *   - Unknown errors (fail fast)
 */
export function classifyError(error: unknown): RetryReason | null {
  if (!error || typeof error !== 'object') return null;

  const e = error as { code?: string; response?: { status?: number } };

  switch (e.code) {
    case 'NETWORK_ERROR': return 'network_error';
    case 'TIMEOUT_ERROR': return 'timeout';
    case 'HTTP_ERROR': {
      const status = e.response?.status ?? 0;
      if (status === 500 || status === 502 || status === 503 || status === 504) {
        return 'server_error';
      }
      return null;  // 4xx, other 5xx — do not retry
    }
    case 'ABORT_ERROR':      return null;
    case 'VALIDATION_ERROR': return null;
    default:                 return null;
  }
}

// ─── NoRetryPolicy ────────────────────────────────────────────────────────────

/** Never retries — passes through immediately. Default policy. */
export class NoRetryPolicy implements RetryPolicy {
  readonly name = 'no-retry';

  evaluate(_ctx: RetryContext): RetryDecision {
    return { shouldRetry: false, delayMs: 0, reason: 'no-retry policy' };
  }
}

// ─── FixedRetryPolicy ────────────────────────────────────────────────────────

export interface FixedRetryOptions extends FixedDelayOptions {
  /** Maximum number of retry attempts. Default: 3. */
  maxAttempts?: number;
}

/** Retries up to maxAttempts times with a fixed delay. */
export class FixedRetryPolicy implements RetryPolicy {
  readonly name = 'fixed-retry';

  private readonly _maxAttempts: number;
  private readonly _strategy:    FixedDelayStrategy;

  constructor(opts: FixedRetryOptions = {}) {
    this._maxAttempts = opts.maxAttempts ?? 3;
    this._strategy    = new FixedDelayStrategy(opts);
  }

  evaluate(ctx: RetryContext): RetryDecision {
    const reason = classifyError(ctx.error);

    if (!reason) {
      return { shouldRetry: false, delayMs: 0, reason: 'error not retryable' };
    }

    // attempt is 1-indexed; maxAttempts includes the first attempt
    if (ctx.attempt >= this._maxAttempts) {
      return {
        shouldRetry: false,
        delayMs:     0,
        reason:      `max attempts (${this._maxAttempts}) reached`,
      };
    }

    const delayMs = this._strategy.calculateDelay(ctx.attempt + 1);
    return { shouldRetry: true, delayMs, reason };
  }
}

// ─── ExponentialBackoffPolicy ────────────────────────────────────────────────

export interface ExponentialBackoffPolicyOptions extends ExponentialBackoffOptions {
  /** Maximum number of retry attempts. Default: 4. */
  maxAttempts?: number;
}

/** Retries up to maxAttempts times with exponential backoff + optional jitter. */
export class ExponentialBackoffPolicy implements RetryPolicy {
  readonly name = 'exponential-backoff';

  private readonly _maxAttempts: number;
  private readonly _strategy:    ExponentialBackoffStrategy;

  constructor(opts: ExponentialBackoffPolicyOptions = {}) {
    this._maxAttempts = opts.maxAttempts ?? 4;
    this._strategy    = new ExponentialBackoffStrategy(opts);
  }

  evaluate(ctx: RetryContext): RetryDecision {
    const reason = classifyError(ctx.error);

    if (!reason) {
      return { shouldRetry: false, delayMs: 0, reason: 'error not retryable' };
    }

    if (ctx.attempt >= this._maxAttempts) {
      return {
        shouldRetry: false,
        delayMs:     0,
        reason:      `max attempts (${this._maxAttempts}) reached`,
      };
    }

    const delayMs = this._strategy.calculateDelay(ctx.attempt + 1);
    return { shouldRetry: true, delayMs, reason };
  }
}

// ─── Future policy placeholders ──────────────────────────────────────────────
// These types define the interface contract for future implementation.
// They are not usable as-is — throw if instantiated to make that clear.

/**
 * @future AdaptiveRetryPolicy — adjusts strategy based on recent success rate.
 * Interface placeholder only. Not implemented in B.2.5.
 */
export class AdaptiveRetryPolicy implements RetryPolicy {
  readonly name = 'adaptive';
  evaluate(_ctx: RetryContext): RetryDecision {
    throw new Error('AdaptiveRetryPolicy is not yet implemented.');
  }
}

/**
 * @future CircuitBreakerPolicy — opens after N failures; rejects immediately while open.
 * Interface placeholder only. Not implemented in B.2.5.
 */
export class CircuitBreakerPolicy implements RetryPolicy {
  readonly name = 'circuit-breaker';
  evaluate(_ctx: RetryContext): RetryDecision {
    throw new Error('CircuitBreakerPolicy is not yet implemented.');
  }
}
