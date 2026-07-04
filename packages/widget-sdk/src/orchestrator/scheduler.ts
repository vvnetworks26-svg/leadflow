/**
 * orchestrator/scheduler.ts
 *
 * Scheduler abstraction + FIFOScheduler implementation.
 *
 * The Scheduler interface decouples the orchestrator from any specific
 * ordering strategy. Swapping to a PriorityScheduler in a future epic
 * only requires replacing the scheduler passed to createOrchestrator().
 *
 * Current implementation: FIFOScheduler — delegates to FIFOQueue.
 *
 * Future schedulers (NOT implemented here):
 *   - PriorityScheduler  — sort by RequestPriority, then FIFO within bucket
 *   - WeightedScheduler  — weighted fair queuing
 *   - FairScheduler      — round-robin across priority buckets
 */

import { FIFOQueue }                        from './queue';
import type { Scheduler, QueuedRequest }    from './types';

// ─── FIFO Scheduler ───────────────────────────────────────────────────────────

export class FIFOScheduler implements Scheduler {
  readonly name = 'fifo';

  private readonly _queue: FIFOQueue;

  constructor() {
    this._queue = new FIFOQueue();
  }

  enqueue(entry: QueuedRequest): void {
    this._queue.enqueue(entry);
  }

  dequeue(): QueuedRequest | null {
    return this._queue.dequeue();
  }

  peek(): QueuedRequest | null {
    return this._queue.peek();
  }

  clear(): void {
    this._queue.clear();
  }

  size(): number {
    return this._queue.size();
  }

  isEmpty(): boolean {
    return this._queue.isEmpty();
  }

  getSnapshot(): ReadonlyArray<QueuedRequest> {
    return this._queue.getSnapshot();
  }

  /** Expose raw statistics from the underlying queue. */
  getStatistics() {
    return this._queue.getStatistics();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create the default FIFO scheduler. */
export function createDefaultScheduler(): FIFOScheduler {
  return new FIFOScheduler();
}
