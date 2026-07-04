/**
 * transport/response.ts
 *
 * Immutable response builder.
 *
 * Adapters use buildResponse() to construct their return value.
 * The resulting object is frozen — callers cannot mutate it.
 */

import type { TransportResponse } from './types';

// ─── Builder ──────────────────────────────────────────────────────────────────

export interface ResponseOptions<T> {
  status:     number;
  headers?:   Record<string, string>;
  body:       T;
  duration:   number;
  requestId:  string;
}

/**
 * Create an immutable TransportResponse.
 */
export function buildResponse<T>(opts: ResponseOptions<T>): TransportResponse<T> {
  return Object.freeze({
    status:     opts.status,
    headers:    Object.freeze({ ...opts.headers }),
    body:       opts.body,
    duration:   opts.duration,
    requestId:  opts.requestId,
    receivedAt: new Date().toISOString(),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true for 2xx status codes. */
export function isSuccess(response: TransportResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/** Returns true for 4xx status codes. */
export function isClientError(response: TransportResponse): boolean {
  return response.status >= 400 && response.status < 500;
}

/** Returns true for 5xx status codes. */
export function isServerError(response: TransportResponse): boolean {
  return response.status >= 500;
}
