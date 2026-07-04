/**
 * orchestrator/orchestrator.ts
 *
 * RequestOrchestrator — serial FIFO request processor.
 *
 * Responsibilities:
 *   - Accept requests via submit() and queue them
 *   - Process exactly one request at a time (no concurrency)
 *   - Delegate actual HTTP to the transport client
 *   - Emit lifecycle events on the shared event bus
 *   - Support pause/resume for future offline or rate-limit scenarios
 *   - Expose diagnostics
 *
 * Processing order (submit → complete):
 *   submit(request)
 *     → buildQueuedRequest()       creates immutable QueuedRequest + deferred promise
 *     → scheduler.enqueue()        adds to FIFO queue
 *     → emit REQUEST_QUEUED
 *     → processNext()              starts processing if not already running and not paused
 *
 *   processNext()
 *     → scheduler.dequeue()
 *     → emit REQUEST_STARTED
 *     → transport.send()
 *     → entry.resolve(response)    or entry.reject(error)
 *     → emit REQUEST_COMPLETED     or REQUEST_CANCELLED (on error)
 *     → loop until queue is empty or paused
 */

import { buildQueuedRequest, withState }  from './request';
import { createDefaultScheduler }         from './scheduler';
import { eventBus }                       from '../eventBus';
import { WidgetEvent }                    from '../events';
import type { TransportClient }           from '../transport/types';
import type { TransportRequest, TransportResponse } from '../transport/types';
import type {
  IRequestOrchestrator,
  OrchestratorDiagnostics,
  QueuedRequest,
  Scheduler,
} from './types';

// ─── Diagnostics state ────────────────────────────────────────────────────────

interface OrchestratorState {
  processedRequests: number;
  queueTimeSamples:  number[];   // ms each request waited before processing
  paused:            boolean;
  processing:        boolean;    // true while a request is in-flight
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOrchestrator(
  transport:  TransportClient,
  scheduler?: Scheduler
): IRequestOrchestrator {

  const _scheduler = scheduler ?? createDefaultScheduler();
  const _state: OrchestratorState = {
    processedRequests: 0,
    queueTimeSamples:  [],
    paused:            false,
    processing:        false,
  };

  // ─── Internal processing loop ──────────────────────────────────────────────

  async function _processLoop(): Promise<void> {
    // Guard: only one concurrent processing loop
    if (_state.processing || _state.paused) return;

    const entry = _scheduler.dequeue();
    if (!entry) return;

    _state.processing = true;

    // Record queue time
    const queueTime = Date.now() - new Date(entry.enqueuedAt).getTime();
    _state.queueTimeSamples.push(queueTime);
    // Keep only the last 50 samples to avoid unbounded growth
    if (_state.queueTimeSamples.length > 50) {
      _state.queueTimeSamples.shift();
    }

    // Update state to 'processing'
    const processingEntry = withState(entry, 'processing');

    eventBus.emit(WidgetEvent.REQUEST_STARTED, {
      timestamp: new Date().toISOString(),
      queueId:   processingEntry.queueId,
      requestId: processingEntry.request.id,
      url:       processingEntry.request.url,
      method:    processingEntry.request.method,
    });

    try {
      const response = await transport.send(processingEntry.request);

      _state.processedRequests++;

      eventBus.emit(WidgetEvent.REQUEST_COMPLETED, {
        timestamp: new Date().toISOString(),
        queueId:   processingEntry.queueId,
        requestId: processingEntry.request.id,
        status:    response.status,
        duration:  response.duration,
        queueTime,
      });

      // Settle the caller's promise
      (processingEntry as QueuedRequest<typeof response.body>).resolve(
        response as TransportResponse<typeof response.body>
      );

    } catch (err) {
      eventBus.emit(WidgetEvent.REQUEST_CANCELLED, {
        timestamp: new Date().toISOString(),
        queueId:   processingEntry.queueId,
        requestId: processingEntry.request.id,
        reason:    err instanceof Error ? err.message : String(err),
      });

      processingEntry.reject(err);
    }

    _state.processing = false;

    // Continue processing the queue
    if (!_scheduler.isEmpty() && !_state.paused) {
      await _processLoop();
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const orchestrator = {
    _scheduler,

    submit<T>(request: TransportRequest): Promise<TransportResponse<T>> {
      const { entry, promise } = buildQueuedRequest<T>(request);

      _scheduler.enqueue(entry as QueuedRequest);

      eventBus.emit(WidgetEvent.REQUEST_QUEUED, {
        timestamp:   new Date().toISOString(),
        queueId:     entry.queueId,
        requestId:   entry.request.id,
        url:         entry.request.url,
        method:      entry.request.method,
        queueLength: _scheduler.size(),
      });

      // Kick off processing (no-op if already running or paused)
      if (!_state.processing && !_state.paused) {
        // Schedule async so submit() returns the promise synchronously
        Promise.resolve().then(() => _processLoop());
      }

      return promise;
    },

    async processNext(): Promise<void> {
      await _processLoop();
    },

    async drain(): Promise<void> {
      while (!_scheduler.isEmpty()) {
        await _processLoop();
        // Safety: if processing gets stuck, bail after the queue clears
        if (_state.paused) break;
      }
    },

    pause(): void {
      _state.paused = true;
    },

    resume(): void {
      _state.paused = false;
      if (!_scheduler.isEmpty() && !_state.processing) {
        Promise.resolve().then(() => _processLoop());
      }
    },

    clear(): void {
      // Cancel all queued (not in-flight) requests
      const snapshot = _scheduler.getSnapshot();
      _scheduler.clear();

      for (const entry of snapshot) {
        entry.reject(new Error('Request cancelled: queue cleared'));
      }

      eventBus.emit(WidgetEvent.QUEUE_CLEARED, {
        timestamp:       new Date().toISOString(),
        cancelledCount:  snapshot.length,
      });
    },

    isPaused(): boolean {
      return _state.paused;
    },

    getDiagnostics(): OrchestratorDiagnostics {
      const samples = _state.queueTimeSamples;
      const avgQueueTime = samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : null;

      return {
        queueLength:       _scheduler.size(),
        processedRequests: _state.processedRequests,
        pendingRequests:   _scheduler.size(),
        paused:            _state.paused,
        schedulerType:     _scheduler.name,
        averageQueueTime:  avgQueueTime,
      };
    },
  };

  return orchestrator;
}
