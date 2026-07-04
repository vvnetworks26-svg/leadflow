/**
 * resilience/manager.ts
 *
 * ResilienceManager — singleton owning timeout, deadline, and cancellation.
 *
 * Responsibilities:
 *   createContext()  — allocate all resources for one request lifecycle
 *   wrapRequest()   — createContext → inject signal → execute → dispose
 *   dispose()        — tear down all active contexts
 *   getDiagnostics() — safe snapshot
 *
 * Integration:
 *   The retry engine delegates to resilienceManager.wrapRequest()
 *   before calling transport.send(). This means every attempt in a retry
 *   sequence gets a fresh context with a fresh timeout.
 */

import { createTimeout, resolveTimeout, mergeSignals } from './timeout';
import { deadlineIn, tighterMs }                        from './deadline';
import { createCancellationSource }                     from './cancellation';
import { eventBus }                                      from '../eventBus';
import { WidgetEvent }                                   from '../events';
import type {
  IResilienceManager,
  ResilienceContext,
  ResilienceDiagnostics,
  TimeoutPolicy,
  Deadline,
} from './types';
import type { TransportRequest, TransportResponse } from '../transport/types';

// ─── UUID ─────────────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Diagnostics state ───────────────────────────────────────────────────────

interface ManagerState {
  defaultTimeoutMs:   number;
  activeContexts:     Map<string, ResilienceContext>;
  timeoutsTriggered:  number;
  deadlinesExpired:   number;
  cancelledRequests:  number;
  lifetimeSamples:    number[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createResilienceManager(defaultTimeoutMs = 0): IResilienceManager {
  const _state: ManagerState = {
    defaultTimeoutMs,
    activeContexts:    new Map(),
    timeoutsTriggered: 0,
    deadlinesExpired:  0,
    cancelledRequests: 0,
    lifetimeSamples:   [],
  };

  return {
    // ─── createContext ───────────────────────────────────────────────────────

    createContext(
      request:    TransportRequest,
      timeoutMs   = 0,
      deadlineMs  = 0
    ): ResilienceContext {
      const contextId  = uuid();
      const createdAt  = new Date().toISOString();
      const createdMs  = Date.now();

      // Build optional deadline
      const deadline: Deadline | null = deadlineMs > 0
        ? deadlineIn(deadlineMs)
        : null;

      // Resolve effective timeout
      const effectiveMs = tighterMs(
        resolveTimeout(timeoutMs, _state.defaultTimeoutMs),
        deadline
      );

      const timeoutPolicy: TimeoutPolicy = {
        mode:      effectiveMs > 0 ? (timeoutMs > 0 ? 'custom' : 'default') : 'none',
        timeoutMs: effectiveMs,
      };

      // Create cancellation source
      const cancellationSrc = createCancellationSource();
      cancellationSrc.token.subscribe((reason) => {
        if (reason !== null && reason !== '__timeout__' && reason !== '__deadline__') {
          _state.cancelledRequests++;
          eventBus.emit(WidgetEvent.REQUEST_ABORTED, {
            timestamp: new Date().toISOString(),
            requestId: request.id,
            contextId,
            reason,
          });
        }
      });

      // Create timeout controller
      const timeoutHandle = createTimeout(effectiveMs, () => {
        _state.timeoutsTriggered++;
        eventBus.emit(WidgetEvent.REQUEST_TIMEOUT, {
          timestamp:  new Date().toISOString(),
          requestId:  request.id,
          contextId,
          timeoutMs:  effectiveMs,
        });
        cancellationSrc.cancel('__timeout__');
      });

      // Deadline expiry handler — check remaining once deadline is set
      if (deadline && deadline.isExpired()) {
        _state.deadlinesExpired++;
        eventBus.emit(WidgetEvent.REQUEST_DEADLINE_EXPIRED, {
          timestamp:  new Date().toISOString(),
          requestId:  request.id,
          contextId,
        });
        cancellationSrc.cancel('__deadline__');
      }

      // Merge the request's own signal with the resilience signal
      const mergedSignal = mergeSignals(
        cancellationSrc.token.toAbortSignal(),
        request.signal
      );

      let _disposed = false;

      const context: ResilienceContext = {
        contextId,
        request,
        timeoutPolicy,
        deadline,
        cancellationToken: cancellationSrc.token,
        signal:            mergedSignal,
        createdAt,
        get disposed() { return _disposed; },

        dispose() {
          if (_disposed) return;
          _disposed = true;

          timeoutHandle.clear();

          const lifetime = Date.now() - createdMs;
          _state.lifetimeSamples.push(lifetime);
          if (_state.lifetimeSamples.length > 100) _state.lifetimeSamples.shift();

          _state.activeContexts.delete(contextId);

          eventBus.emit(WidgetEvent.RESILIENCE_CONTEXT_DISPOSED, {
            timestamp:  new Date().toISOString(),
            contextId,
            requestId:  request.id,
            lifetimeMs: lifetime,
          });
        },
      };

      _state.activeContexts.set(contextId, context);

      eventBus.emit(WidgetEvent.RESILIENCE_CONTEXT_CREATED, {
        timestamp:  createdAt,
        contextId,
        requestId:  request.id,
        timeoutMs:  effectiveMs,
      });

      return context;
    },

    // ─── wrapRequest ────────────────────────────────────────────────────────

    async wrapRequest<T>(
      request:   TransportRequest,
      executor:  (req: TransportRequest) => Promise<TransportResponse<T>>,
      timeoutMs?: number
    ): Promise<TransportResponse<T>> {
      const ctx = this.createContext(request, timeoutMs ?? 0);

      // Build the request with the merged AbortSignal injected
      const wrappedRequest: TransportRequest = Object.freeze({
        ...request,
        signal: ctx.signal,
      });

      try {
        const response = await executor(wrappedRequest);
        return response;
      } finally {
        ctx.dispose();
      }
    },

    // ─── Configuration ───────────────────────────────────────────────────────

    setDefaultTimeout(ms: number): void {
      _state.defaultTimeoutMs = Math.max(0, ms);
    },

    getDefaultTimeout(): number {
      return _state.defaultTimeoutMs;
    },

    // ─── Dispose all ────────────────────────────────────────────────────────

    dispose(): void {
      for (const ctx of _state.activeContexts.values()) {
        ctx.dispose();
      }
    },

    // ─── Diagnostics ────────────────────────────────────────────────────────

    getDiagnostics(): ResilienceDiagnostics {
      const samples = _state.lifetimeSamples;
      const avg = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : null;

      return {
        activeContexts:    _state.activeContexts.size,
        timeoutsTriggered: _state.timeoutsTriggered,
        deadlinesExpired:  _state.deadlinesExpired,
        cancelledRequests: _state.cancelledRequests,
        averageLifetime:   avg,
      };
    },
  };
}
