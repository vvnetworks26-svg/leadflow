/**
 * retry/strategies.ts
 *
 * Retry delay strategies.
 * All strategies are stateless — pure functions wrapped in objects.
 *
 * Implemented:
 *   NoRetryStrategy        — always returns 0 (used by NoRetryPolicy)
 *   FixedDelayStrategy     — constant delay every attempt
 *   ExponentialBackoffStrategy — delay = baseDelay × 2^(attempt-2), capped at maxDelay
 *
 * Formula for exponential backoff:
 *   attempt 2 (first retry): baseDelay × 2^0 = baseDelay
 *   attempt 3 (second retry): baseDelay × 2^1 = baseDelay × 2
 *   attempt 4 (third retry):  baseDelay × 2^2 = baseDelay × 4
 *   ...capped at maxDelay
 *
 * Jitter (optional): adds a random fraction of the delay to spread load.
 *   delay += Math.random() * delay * jitterFactor   (jitterFactor 0–1)
 */

import type { RetryStrategy } from './types';

// ─── NoRetryStrategy ─────────────────────────────────────────────────────────

/** Used internally by NoRetryPolicy. Always returns 0 delay. */
export class NoRetryStrategy implements RetryStrategy {
  readonly name = 'no-retry';
  calculateDelay(_attempt: number): number { return 0; }
}

// ─── FixedDelayStrategy ──────────────────────────────────────────────────────

export interface FixedDelayOptions {
  /** Delay in ms between every attempt. Default: 1000. */
  delayMs?: number;
}

/** Returns the same delay for every retry attempt. */
export class FixedDelayStrategy implements RetryStrategy {
  readonly name = 'fixed-delay';
  private readonly _delayMs: number;

  constructor(opts: FixedDelayOptions = {}) {
    this._delayMs = opts.delayMs ?? 1000;
  }

  calculateDelay(_attempt: number): number {
    return this._delayMs;
  }
}

// ─── ExponentialBackoffStrategy ──────────────────────────────────────────────

export interface ExponentialBackoffOptions {
  /** Base delay in ms (applied on the first retry). Default: 500. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30 000. */
  maxDelayMs?: number;
  /**
   * Jitter factor 0–1.
   * 0 = no jitter (default), 1 = up to 100% added jitter.
   * Adds `Math.random() * delay * jitterFactor` to the computed delay.
   */
  jitter?: number;
}

/**
 * Exponential backoff with optional jitter.
 *
 * delay = min(baseDelay × 2^(attempt-2), maxDelay)
 *       + (optional jitter)
 */
export class ExponentialBackoffStrategy implements RetryStrategy {
  readonly name = 'exponential-backoff';

  private readonly _baseDelayMs: number;
  private readonly _maxDelayMs:  number;
  private readonly _jitter:      number;

  constructor(opts: ExponentialBackoffOptions = {}) {
    this._baseDelayMs = opts.baseDelayMs ?? 500;
    this._maxDelayMs  = opts.maxDelayMs  ?? 30_000;
    this._jitter      = Math.max(0, Math.min(1, opts.jitter ?? 0));
  }

  calculateDelay(attempt: number): number {
    // attempt is 1-indexed; first retry is attempt 2
    const retryIndex = Math.max(0, attempt - 2);
    const base = this._baseDelayMs * Math.pow(2, retryIndex);
    const capped = Math.min(base, this._maxDelayMs);

    if (this._jitter > 0) {
      return capped + Math.random() * capped * this._jitter;
    }
    return capped;
  }
}
