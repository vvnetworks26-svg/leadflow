/**
 * transport/errors.ts
 *
 * Transport error hierarchy.
 * Every error thrown by the transport layer extends TransportError.
 *
 * Error codes are string literals so callers can branch without instanceof.
 *
 * Rules:
 *   - Never throw plain Error from transport modules — always TransportError.
 *   - The request field is always present (available at throw site).
 *   - The response field is optional — may be null if no response was received.
 *   - All errors are serialisable to JSON for diagnostics.
 */

import type { TransportRequest, TransportResponse } from './types';

// ─── Error codes ──────────────────────────────────────────────────────────────

export type TransportErrorCode =
  | 'TRANSPORT_ERROR'      // Base / unknown
  | 'TIMEOUT_ERROR'        // Request exceeded timeout
  | 'NETWORK_ERROR'        // Network-level failure (no response)
  | 'ABORT_ERROR'          // Cancelled via AbortSignal
  | 'VALIDATION_ERROR'     // Request failed pre-flight validation
  | 'HTTP_ERROR';          // Non-2xx response received

// ─── Base error ───────────────────────────────────────────────────────────────

export class TransportError extends Error {
  readonly code:     TransportErrorCode;
  readonly request:  TransportRequest;
  readonly response: TransportResponse<unknown> | null;

  constructor(
    message:  string,
    code:     TransportErrorCode,
    request:  TransportRequest,
    response: TransportResponse<unknown> | null = null
  ) {
    super(message);
    this.name     = 'TransportError';
    this.code     = code;
    this.request  = request;
    this.response = response;
  }

  /** Serialise to a plain object — safe for logging and diagnostics. */
  toJSON(): Record<string, unknown> {
    return {
      name:      this.name,
      code:      this.code,
      message:   this.message,
      requestId: this.request.id,
      url:       this.request.url,
      method:    this.request.method,
      status:    this.response?.status ?? null,
    };
  }
}

// ─── Specific error types ─────────────────────────────────────────────────────

/** Request timed out before a response was received. */
export class TimeoutError extends TransportError {
  readonly timeoutMs: number;

  constructor(request: TransportRequest, timeoutMs: number) {
    super(
      `Request timed out after ${timeoutMs}ms (${request.method} ${request.url})`,
      'TIMEOUT_ERROR',
      request
    );
    this.name      = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Network-level failure — no response received (e.g. offline, DNS failure). */
export class NetworkError extends TransportError {
  constructor(request: TransportRequest, cause?: string) {
    super(
      `Network error on ${request.method} ${request.url}` +
      (cause ? `: ${cause}` : ''),
      'NETWORK_ERROR',
      request
    );
    this.name = 'NetworkError';
  }
}

/** Request was cancelled via AbortSignal. */
export class AbortError extends TransportError {
  constructor(request: TransportRequest) {
    super(
      `Request aborted: ${request.method} ${request.url}`,
      'ABORT_ERROR',
      request
    );
    this.name = 'AbortError';
  }
}

/** Request failed pre-flight validation (missing required field, etc.). */
export class ValidationError extends TransportError {
  readonly field: string;

  constructor(request: TransportRequest, field: string, detail: string) {
    super(
      `Request validation failed [${field}]: ${detail}`,
      'VALIDATION_ERROR',
      request
    );
    this.name  = 'ValidationError';
    this.field = field;
  }
}

/** Server returned a non-2xx HTTP status code. */
export class HttpError extends TransportError {
  constructor(
    request:  TransportRequest,
    response: TransportResponse<unknown>
  ) {
    super(
      `HTTP ${response.status} on ${request.method} ${request.url}`,
      'HTTP_ERROR',
      request,
      response
    );
    this.name = 'HttpError';
  }
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isTransportError(err: unknown): err is TransportError {
  return err instanceof TransportError;
}
