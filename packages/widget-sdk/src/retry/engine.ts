/**
 * retry/engine.ts
 *
 * RetryEngine — executes requests with retry logic.
 *
 * The engine owns:
 *   - The active RetryPolicy (default: NoRetryPolicy)
 *   - Diagnostic counters
 *
 * The engine does NOT own:
 *   - The transport client (passed in by the orchestrator)
 *   - Any queue or concurrency logic (that's the orchestrator's job)
 *
 * Processing flow for execute():
 *   1. Emit RETRY_STARTED
 *   2. Call executor(request) — attempt 1
 *   3. On success → emit RETRY_COMPLETED, return response
 *   4. On failure → classify error, ask policy.evaluate()
 *   5. If shouldRetry → emit RETRY_ATTEMPT, RETRY_DELAY, wait, go to step 2
 *   6. If exhausted → emit RETRY_FAILED, rethrow last error
 *
 * Constraints:
 *   - No networking inside the engine (executor is injected)
 *   - No concurrency
 *   - No cancellation changes
 *   - No persistence
 */

import { eventBus }       from '../eventBus';
import { WidgetEvent }    from '../events';
import { NoRetryPolicy }  from './policy';
import { classifyError }  from './policy';
import type {
  IRetryEngine,
  RetryPolicy,
  RetryContext,
  RetryDecision,
  RetryDiagnostics,
} from './types';
import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── Delay helper ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Diagnostics state ───────────────────────────────────────────────────────

interface EngineState {
  totalRetries:      number;
  successfulRetries: number;
  failedRetries:     number;
  totalAttempts:     number;   // across all retry sequences (for average calculation)
  retryCount:        number;   // number of sequences that had at least one retry
  lastRetryDelay:    number | null;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createRetryEngine(initialPolicy?: RetryPolicy): IRetryEngine {
  let _policy: RetryPolicy = initialPolicy ?? new NoRetryPolicy();

  const _state: EngineState = {
    totalRetries:      0,
    successfulRetries: 0,
    failedRetries:     0,
    totalAttempts:     0,
    retryCount:        0,
    lastRetryDelay:    null,
  };

  return {
    // ─── execute ────────────────────────────────────────────────────────────

    async execute<T>(
      request:  TransportRequest,
      executor: (req: TransportRequest) => Promise<TransportResponse<T>>
    ): Promise<TransportResponse<T>> {

      const startedAt = new Date().toISOString();
      const startMs   = Date.now();
      let   attempt   = 1;
      let   lastError: unknown = null;

      eventBus.emit(WidgetEvent.RETRY_STARTED, {
        timestamp: startedAt,
        requestId: request.id,
        policy:    _policy.name,
      });

      while (true) {
        try {
          const response = await executor(request);

          // Success
          const wasRetried = attempt > 1;
          if (wasRetried) {
            _state.successfulRetries++;
            _state.totalAttempts += attempt;
            _state.retryCount++;
          }

          eventBus.emit(WidgetEvent.RETRY_COMPLETED, {
            timestamp:  new Date().toISOString(),
            requestId:  request.id,
            attempts:   attempt,
            totalMs:    Date.now() - startMs,
            success:    true,
          });

          return response;

        } catch (err) {
          lastError = err;

          const ctx: RetryContext = {
            request,
            attempt,
            error:     err,
            startedAt,
            elapsedMs: Date.now() - startMs,
            reason:    classifyError(err),
          };

          const decision: RetryDecision = _policy.evaluate(ctx);

          if (!decision.shouldRetry) {
            // Exhausted or not retryable
            const wasRetried = attempt > 1;
            if (wasRetried) {
              _state.failedRetries++;
              _state.totalAttempts += attempt;
              _state.retryCount++;
            }

            eventBus.emit(WidgetEvent.RETRY_FAILED, {
              timestamp:  new Date().toISOString(),
              requestId:  request.id,
              attempts:   attempt,
              totalMs:    Date.now() - startMs,
              errorCode:  (err as { code?: string }).code ?? 'UNKNOWN',
              reason:     decision.reason ?? 'not retryable',
            });

            throw lastError;
          }

          // Retrying
          _state.totalRetries++;
          _state.lastRetryDelay = decision.delayMs;

          eventBus.emit(WidgetEvent.RETRY_ATTEMPT, {
            timestamp:  new Date().toISOString(),
            requestId:  request.id,
            attempt:    attempt + 1,
            delayMs:    decision.delayMs,
            reason:     ctx.reason ?? 'unknown',
            errorCode:  (err as { code?: string }).code ?? 'UNKNOWN',
          });

          if (decision.delayMs > 0) {
            eventBus.emit(WidgetEvent.RETRY_DELAY, {
              timestamp:  new Date().toISOString(),
              requestId:  request.id,
              delayMs:    decision.delayMs,
              attempt:    attempt + 1,
            });

            await sleep(decision.delayMs);
          }

          attempt++;
        }
      }
    },

    // ─── shouldRetry ────────────────────────────────────────────────────────

    shouldRetry(ctx: RetryContext): RetryDecision {
      return _policy.evaluate(ctx);
    },

    // ─── calculateDelay ─────────────────────────────────────────────────────

    calculateDelay(attempt: number): number {
      // Delegate to the policy's internal strategy via a dummy context
      const dummy: RetryContext = {
        request:   null as never,
        attempt,
        error:     { code: 'NETWORK_ERROR' },
        startedAt: new Date().toISOString(),
        elapsedMs: 0,
        reason:    'network_error',
      };
      const decision = _policy.evaluate(dummy);
      return decision.delayMs;
    },

    // ─── Policy management ───────────────────────────────────────────────────

    setPolicy(policy: RetryPolicy): void {
      _policy = policy;
    },

    getPolicy(): RetryPolicy {
      return _policy;
    },

    // ─── Diagnostics ────────────────────────────────────────────────────────

    getDiagnostics(): RetryDiagnostics {
      const avg = _state.retryCount > 0
        ? _state.totalAttempts / _state.retryCount
        : null;

      return {
        totalRetries:      _state.totalRetries,
        successfulRetries: _state.successfulRetries,
        failedRetries:     _state.failedRetries,
        averageAttempts:   avg,
        lastRetryDelay:    _state.lastRetryDelay,
        activePolicy:      _policy.name,
      };
    },
  };
}
