/**
 * orchestrator/request.ts
 *
 * Immutable QueuedRequest factory.
 * Wraps a TransportRequest with queue metadata and a deferred Promise.
 */

import type { TransportRequest, TransportResponse } from '../transport/types';
import type { QueuedRequest, RequestPriority } from './types';

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

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface DeferredQueuedRequest<T = unknown> {
  entry:   QueuedRequest<T>;
  promise: Promise<TransportResponse<T>>;
}

/**
 * Build an immutable QueuedRequest with an attached deferred Promise.
 * The caller holds the promise; the orchestrator holds resolve/reject.
 */
export function buildQueuedRequest<T>(
  request:  TransportRequest,
  priority: RequestPriority = 'normal'
): DeferredQueuedRequest<T> {
  let resolve!: (response: TransportResponse<T>) => void;
  let reject!:  (error: unknown) => void;

  const promise = new Promise<TransportResponse<T>>((res, rej) => {
    resolve = res;
    reject  = rej;
  });

  const entry: QueuedRequest<T> = Object.freeze({
    queueId:    uuid(),
    request,
    enqueuedAt: new Date().toISOString(),
    state:      'queued',
    priority,
    resolve,
    reject,
  });

  return { entry, promise };
}

/**
 * Return a new QueuedRequest with an updated state.
 * The original entry is not modified.
 */
export function withState<T>(
  entry: QueuedRequest<T>,
  state: QueuedRequest<T>['state']
): QueuedRequest<T> {
  return Object.freeze({ ...entry, state });
}
