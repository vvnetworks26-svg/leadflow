/**
 * transport/types.ts
 *
 * Core interfaces for the transport layer.
 * No implementation — pure type contracts.
 *
 * Design goals:
 *   - Every type is explicitly named and exported
 *   - No `any`. No `unknown` in public surfaces.
 *   - All request/response objects are treated as immutable at the type level
 *   - Adapters are swappable — the client only depends on TransportAdapter
 */

// ─── HTTP method ──────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// ─── Request ──────────────────────────────────────────────────────────────────

/**
 * An immutable transport request descriptor.
 * Created by the request builder — never mutated after construction.
 */
export interface TransportRequest {
  /** Unique UUID assigned at request creation. Used for tracing. */
  readonly id:       string;
  readonly method:   HttpMethod;
  /** Fully qualified URL or path (relative to a configured base URL). */
  readonly url:      string;
  /** Request headers. Frozen. */
  readonly headers:  Readonly<Record<string, string>>;
  /** URL query parameters. Frozen. */
  readonly query:    Readonly<Record<string, string>>;
  /** Request body. Null for GET/HEAD/DELETE. Frozen. */
  readonly body:     Readonly<Record<string, unknown>> | null;
  /** Timeout in milliseconds. 0 = no timeout. */
  readonly timeout:  number;
  /** AbortSignal for external cancellation. Null if not provided. */
  readonly signal:   AbortSignal | null;
  /** Arbitrary metadata for middleware use. Frozen. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** ISO-8601 timestamp when the request object was created. */
  readonly createdAt: string;
}

// ─── Response ─────────────────────────────────────────────────────────────────

/**
 * An immutable transport response.
 * Returned by the adapter after a request completes.
 */
export interface TransportResponse<T = unknown> {
  /** The HTTP status code. */
  readonly status:    number;
  /** Response headers. Frozen. */
  readonly headers:   Readonly<Record<string, string>>;
  /** Parsed response body. */
  readonly body:      T;
  /** Round-trip duration in milliseconds. */
  readonly duration:  number;
  /** The original request ID. Enables request/response correlation. */
  readonly requestId: string;
  /** ISO-8601 timestamp when the response was received. */
  readonly receivedAt: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * A transport adapter is the only place that performs actual I/O.
 * All adapters implement this interface — the client never calls fetch directly.
 *
 * Current adapters:
 *   - MockAdapter (in-memory, configurable latency + success/failure)
 *
 * Future adapters:
 *   - FetchAdapter (real HTTP via window.fetch)
 */
export interface TransportAdapter {
  /** Human-readable name for diagnostics (e.g. 'mock', 'fetch'). */
  readonly name: string;

  /**
   * Execute a request and return a response.
   * Must throw a TransportError (or subclass) on failure.
   */
  execute<T>(request: TransportRequest): Promise<TransportResponse<T>>;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * The context object passed through the middleware pipeline.
 * Middleware may augment the request (before the adapter) or the response
 * (after the adapter).
 */
export interface TransportContext<T = unknown> {
  /** The request being processed. Middleware may replace this with a new request. */
  request:  TransportRequest;
  /** The response, available after the adapter executes. Null before that point. */
  response: TransportResponse<T> | null;
  /** Accumulated metadata set by middleware. */
  meta:     Record<string, unknown>;
}

/**
 * A middleware function.
 *
 * @param ctx  - The current pipeline context.
 * @param next - Call next() to continue the pipeline. Must be awaited.
 */
export type TransportMiddleware<T = unknown> = (
  ctx:  TransportContext<T>,
  next: () => Promise<void>
) => Promise<void>;

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * The public interface of the transport client singleton.
 */
export interface TransportClient {
  /**
   * Send a request through the full pipeline.
   * Returns the response body on success.
   * Throws a TransportError on any failure.
   */
  send<T>(request: TransportRequest): Promise<TransportResponse<T>>;

  /** Register a middleware function. Middlewares run in registration order. */
  use(middleware: TransportMiddleware): void;

  /** Remove all registered middleware. */
  clearMiddleware(): void;

  /** Replace the active adapter. */
  setAdapter(adapter: TransportAdapter): void;

  /** Returns the active adapter. */
  getAdapter(): TransportAdapter;

  /** Returns the number of registered middleware functions. */
  middlewareCount(): number;
}
