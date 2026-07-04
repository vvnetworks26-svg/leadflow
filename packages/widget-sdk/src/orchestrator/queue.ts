/**
 * orchestrator/queue.ts
 *
 * FIFO queue implementation.
 *
 * Entries are stored in insertion order.
 * All reads are non-destructive except dequeue().
 * The queue never mutates entries — it stores and returns the same frozen objects.
 */

import type { QueuedRequest, QueueStatistics } from './types';

// ─── Implementation ───────────────────────────────────────────────────────────

export class FIFOQueue {
  private readonly _items: QueuedRequest[] = [];
  private _totalEnqueued = 0;
  private _totalDequeued = 0;

  /** Add a request to the back of the queue. */
  enqueue(entry: QueuedRequest): void {
    this._items.push(entry);
    this._totalEnqueued++;
  }

  /**
   * Remove and return the front item.
   * Returns null when the queue is empty.
   */
  dequeue(): QueuedRequest | null {
    if (this._items.length === 0) return null;
    this._totalDequeued++;
    return this._items.shift()!;
  }

  /**
   * Return the front item without removing it.
   * Returns null when the queue is empty.
   */
  peek(): QueuedRequest | null {
    return this._items[0] ?? null;
  }

  /** Remove all items from the queue. Increments totalDequeued for each removed item. */
  clear(): void {
    this._totalDequeued += this._items.length;
    this._items.length = 0;
  }

  /** Number of items currently in the queue. */
  size(): number {
    return this._items.length;
  }

  /** True when the queue contains no items. */
  isEmpty(): boolean {
    return this._items.length === 0;
  }

  /**
   * Return a frozen snapshot of all current items in FIFO order.
   * The snapshot is a new array — mutations do not affect the queue.
   */
  getSnapshot(): ReadonlyArray<QueuedRequest> {
    return Object.freeze([...this._items]);
  }

  /** Current queue statistics. */
  getStatistics(): QueueStatistics {
    return {
      length:        this._items.length,
      totalEnqueued: this._totalEnqueued,
      totalDequeued: this._totalDequeued,
    };
  }
}
