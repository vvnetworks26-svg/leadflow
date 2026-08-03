/**
 * tool-orchestration/RetryPolicy.ts
 *
 * Configurable retry engine.
 *
 * Supports:
 *   - immediate retry
 *   - exponential backoff
 *   - linear backoff
 *   - per-call timeout
 *   - circuit breaker (trip after N consecutive failures per tool)
 *
 * PURE logic + async execution. No DB. No side effects beyond retrying.
 */

import type { ToolName } from './types';
import type { RetryConfig } from './ToolRegistry';

// ─── Circuit breaker state ────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerStatus {
  state:              CircuitState;
  consecutiveFailures:number;
  lastOpenedAt?:      number;    // ms timestamp
  halfOpenAt?:        number;    // when to probe again
}

// Global circuit breaker state (per tool, per conversation context).
// Keyed by `${conversationId}:${toolName}`.
const _circuits = new Map<string, CircuitBreakerStatus>();

const HALF_OPEN_DELAY_MS = 10_000;  // 10 s cool-down

function circuitKey(conversationId: string, tool: ToolName): string {
  return `${conversationId}:${tool}`;
}

function getCircuit(key: string): CircuitBreakerStatus {
  return _circuits.get(key) ?? { state: 'closed', consecutiveFailures: 0 };
}

function recordSuccess(key: string): void {
  _circuits.set(key, { state: 'closed', consecutiveFailures: 0 });
}

function recordFailure(key: string, threshold: number): void {
  const prev = getCircuit(key);
  const cf   = prev.consecutiveFailures + 1;
  if (cf >= threshold) {
    _circuits.set(key, {
      state:               'open',
      consecutiveFailures: cf,
      lastOpenedAt:        Date.now(),
      halfOpenAt:          Date.now() + HALF_OPEN_DELAY_MS,
    });
  } else {
    _circuits.set(key, { ...prev, consecutiveFailures: cf });
  }
}

function isCircuitOpen(key: string): boolean {
  const c = getCircuit(key);
  if (c.state === 'closed')    return false;
  if (c.state === 'open') {
    // Transition to half-open after cool-down
    if (c.halfOpenAt && Date.now() >= c.halfOpenAt) {
      _circuits.set(key, { ...c, state: 'half_open' });
      return false;
    }
    return true;
  }
  // half_open: allow one probe
  return false;
}

// ─── Delay helpers ────────────────────────────────────────────────────────────

function computeDelay(config: RetryConfig, attempt: number): number {
  if (config.strategy === 'immediate') return 0;
  if (config.strategy === 'linear') {
    return Math.min(config.baseDelayMs * attempt, config.maxDelayMs);
  }
  // exponential
  return Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Retry executor ───────────────────────────────────────────────────────────

export interface RetryResult<T> {
  readonly value?:    T;
  readonly error?:    Error;
  readonly attempts:  number;
  readonly succeeded: boolean;
  readonly timedOut:  boolean;
}

/**
 * Execute `fn` with the retry policy defined by `config`.
 * `conversationId` + `tool` are used for circuit breaker keying.
 */
export async function withRetry<T>(
  fn:             () => Promise<T>,
  config:         RetryConfig,
  tool:           ToolName,
  conversationId: string,
): Promise<RetryResult<T>> {
  const key = circuitKey(conversationId, tool);

  // Circuit open — don't even attempt
  if (config.circuitBreaker && isCircuitOpen(key)) {
    return {
      error:     new Error(`Circuit open for tool: ${tool}`),
      attempts:  0,
      succeeded: false,
      timedOut:  false,
    };
  }

  let lastError: Error | undefined;
  let attempts  = 0;
  let timedOut  = false;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    attempts++;
    try {
      // Enforce per-attempt timeout
      const value = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool timeout: ${tool}`)), config.timeoutMs)
        ),
      ]);
      if (config.circuitBreaker) recordSuccess(key);
      return { value, attempts, succeeded: true, timedOut: false };

    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      timedOut  = lastError.message.startsWith('Tool timeout');

      if (config.circuitBreaker) {
        recordFailure(key, config.circuitBreakerThreshold);
      }

      // Don't retry timeouts — or if this was the last attempt
      if (timedOut || attempt >= config.maxAttempts) break;

      const delay = computeDelay(config, attempt);
      if (delay > 0) await sleep(delay);
    }
  }

  return { error: lastError, attempts, succeeded: false, timedOut };
}

// ─── Circuit breaker API (for tests and metrics) ──────────────────────────────

export const CircuitBreaker = {

  /** Get the current state of a circuit. */
  get(tool: ToolName, conversationId: string): CircuitBreakerStatus {
    return getCircuit(circuitKey(conversationId, tool));
  },

  /** Manually reset a circuit to closed. */
  reset(tool: ToolName, conversationId: string): void {
    _circuits.delete(circuitKey(conversationId, tool));
  },

  /** Reset ALL circuits (for test isolation). */
  resetAll(): void {
    _circuits.clear();
  },

  /** Returns true if circuit is open. */
  isOpen(tool: ToolName, conversationId: string): boolean {
    return isCircuitOpen(circuitKey(conversationId, tool));
  },
};
