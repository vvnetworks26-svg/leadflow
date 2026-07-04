/**
 * transport/request.ts
 *
 * Immutable request builder.
 *
 * Usage:
 *   const req = buildRequest('GET', '/api/v1/health');
 *   const req = buildRequest('POST', '/api/v1/leads', { body: { name: 'Jane' } });
 *
 * The returned TransportRequest is frozen — cannot be mutated after creation.
 * To "modify" a request, use withHeaders() / withQuery() / withBody() which
 * return new frozen copies.
 */

import type { TransportRequest, HttpMethod } from './types';

// ─── UUID generator ───────────────────────────────────────────────────────────

/**
 * Generate a UUID v4.
 * Uses crypto.randomUUID when available, falls back to Math.random.
 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Polyfill for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Build options ────────────────────────────────────────────────────────────

export interface RequestOptions {
  headers?:  Record<string, string>;
  query?:    Record<string, string>;
  body?:     Record<string, unknown> | null;
  timeout?:  number;
  signal?:   AbortSignal | null;
  metadata?: Record<string, unknown>;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Create an immutable TransportRequest.
 *
 * @param method  - HTTP method.
 * @param url     - Full URL or path.
 * @param options - Optional headers, query, body, timeout, signal, metadata.
 */
export function buildRequest(
  method:  HttpMethod,
  url:     string,
  options: RequestOptions = {}
): TransportRequest {
  return Object.freeze({
    id:        uuid(),
    method,
    url,
    headers:   Object.freeze({ ...options.headers }),
    query:     Object.freeze({ ...options.query }),
    body:      options.body != null ? Object.freeze({ ...options.body }) : null,
    timeout:   options.timeout  ?? 0,
    signal:    options.signal   ?? null,
    metadata:  Object.freeze({ ...options.metadata }),
    createdAt: new Date().toISOString(),
  });
}

// ─── Immutable update helpers ────────────────────────────────────────────────

/**
 * Return a new request with additional headers merged.
 * The original request is not modified.
 */
export function withHeaders(
  req:     TransportRequest,
  headers: Record<string, string>
): TransportRequest {
  return Object.freeze({
    ...req,
    headers: Object.freeze({ ...req.headers, ...headers }),
  });
}

/**
 * Return a new request with additional query parameters merged.
 */
export function withQuery(
  req:   TransportRequest,
  query: Record<string, string>
): TransportRequest {
  return Object.freeze({
    ...req,
    query: Object.freeze({ ...req.query, ...query }),
  });
}

/**
 * Return a new request with the body replaced.
 */
export function withBody(
  req:  TransportRequest,
  body: Record<string, unknown>
): TransportRequest {
  return Object.freeze({
    ...req,
    body: Object.freeze({ ...body }),
  });
}

/**
 * Return a new request with additional metadata merged.
 */
export function withMetadata(
  req:      TransportRequest,
  metadata: Record<string, unknown>
): TransportRequest {
  return Object.freeze({
    ...req,
    metadata: Object.freeze({ ...req.metadata, ...metadata }),
  });
}

// ─── Convenience builders ────────────────────────────────────────────────────

export const GET    = (url: string, opts?: RequestOptions) => buildRequest('GET',    url, opts);
export const POST   = (url: string, opts?: RequestOptions) => buildRequest('POST',   url, opts);
export const PUT    = (url: string, opts?: RequestOptions) => buildRequest('PUT',    url, opts);
export const PATCH  = (url: string, opts?: RequestOptions) => buildRequest('PATCH',  url, opts);
export const DELETE = (url: string, opts?: RequestOptions) => buildRequest('DELETE', url, opts);
