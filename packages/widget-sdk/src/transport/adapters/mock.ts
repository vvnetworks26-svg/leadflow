/**
 * transport/adapters/mock.ts
 *
 * In-memory mock adapter for development and testing.
 *
 * Features:
 *   - No fetch, no network — all responses are simulated in-memory
 *   - Configurable artificial latency (minLatencyMs / maxLatencyMs)
 *   - Configurable failure mode (failRate 0.0–1.0)
 *   - Per-URL response handlers (register mock routes)
 *   - Default handler for unmatched routes (returns 200 by default)
 *   - Request history for test assertions
 *
 * Usage:
 *   const mock = createMockAdapter({ latencyMs: 50 });
 *   mock.on('GET', '/api/v1/health', () => ({ status: 200, body: { ok: true } }));
 *   transport.setAdapter(mock);
 */

import { buildResponse }                from '../response';
import { NetworkError, TimeoutError }   from '../errors';
import type { TransportAdapter, TransportRequest, TransportResponse } from '../types';

// ─── Handler types ────────────────────────────────────────────────────────────

export interface MockResponseSpec<T = unknown> {
  status:   number;
  body:     T;
  headers?: Record<string, string>;
}

export type MockHandler<T = unknown> = (
  request: TransportRequest
) => MockResponseSpec<T> | Promise<MockResponseSpec<T>>;

// ─── Options ──────────────────────────────────────────────────────────────────

export interface MockAdapterOptions {
  /** Minimum artificial latency in ms. Default: 0. */
  minLatencyMs?: number;
  /** Maximum artificial latency in ms. Default: 0 (= no extra delay). */
  maxLatencyMs?: number;
  /** Fraction of requests that should fail with a NetworkError (0.0–1.0). Default: 0. */
  failRate?: number;
  /** When true, log each simulated request to the console. Default: false. */
  debug?: boolean;
}

// ─── Route key ────────────────────────────────────────────────────────────────

function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()}::${url}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface MockAdapter extends TransportAdapter {
  /** Register a handler for a specific method + URL. */
  on<T>(method: string, url: string, handler: MockHandler<T>): void;
  /** Remove a registered handler. */
  off(method: string, url: string): void;
  /** Set the default handler used when no route matches. */
  setDefaultHandler<T>(handler: MockHandler<T>): void;
  /** Returns a copy of all requests made since the adapter was created. */
  getHistory(): TransportRequest[];
  /** Clear request history. */
  clearHistory(): void;
  /** Update adapter options at runtime (e.g. change latency during tests). */
  configure(opts: MockAdapterOptions): void;
}

export function createMockAdapter(options: MockAdapterOptions = {}): MockAdapter {
  const _handlers = new Map<string, MockHandler>();
  const _history:  TransportRequest[] = [];

  let _opts: Required<MockAdapterOptions> = {
    minLatencyMs: options.minLatencyMs ?? 0,
    maxLatencyMs: options.maxLatencyMs ?? 0,
    failRate:     options.failRate     ?? 0,
    debug:        options.debug        ?? false,
  };

  // Default handler — returns 200 with an empty body for unregistered routes
  let _defaultHandler: MockHandler = () => ({ status: 200, body: {} });

  function _delay(): Promise<void> {
    const { minLatencyMs, maxLatencyMs } = _opts;
    if (maxLatencyMs <= 0) return Promise.resolve();
    const ms = minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs);
    return new Promise(r => setTimeout(r, ms));
  }

  const adapter: MockAdapter = {
    name: 'mock',

    async execute<T>(request: TransportRequest): Promise<TransportResponse<T>> {
      _history.push(request);

      if (_opts.debug) {
        console.log(`[LeadFlow][MockAdapter] ${request.method} ${request.url}`);
      }

      // Check abort before doing any work
      if (request.signal?.aborted) {
        const { AbortError } = await import('../errors');
        throw new AbortError(request);
      }

      // Simulate latency
      await _delay();

      // Check abort after latency
      if (request.signal?.aborted) {
        const { AbortError } = await import('../errors');
        throw new AbortError(request);
      }

      // Simulate timeout (if timeout is set and latency exceeded it)
      if (request.timeout > 0 && _opts.maxLatencyMs > request.timeout) {
        throw new TimeoutError(request, request.timeout);
      }

      // Simulate random failure
      if (_opts.failRate > 0 && Math.random() < _opts.failRate) {
        throw new NetworkError(request, 'Simulated network failure');
      }

      // Find handler
      const key     = routeKey(request.method, request.url);
      const handler = _handlers.get(key) ?? _defaultHandler;
      const spec    = await handler(request) as MockResponseSpec<T>;

      const startedAt = Date.now();

      return buildResponse<T>({
        status:    spec.status,
        headers:   spec.headers ?? {},
        body:      spec.body,
        duration:  Date.now() - startedAt,
        requestId: request.id,
      });
    },

    on<T>(method: string, url: string, handler: MockHandler<T>): void {
      _handlers.set(routeKey(method, url), handler as MockHandler);
    },

    off(method: string, url: string): void {
      _handlers.delete(routeKey(method, url));
    },

    setDefaultHandler<T>(handler: MockHandler<T>): void {
      _defaultHandler = handler as MockHandler;
    },

    getHistory(): TransportRequest[] {
      return [..._history];
    },

    clearHistory(): void {
      _history.length = 0;
    },

    configure(opts: MockAdapterOptions): void {
      _opts = {
        minLatencyMs: opts.minLatencyMs ?? _opts.minLatencyMs,
        maxLatencyMs: opts.maxLatencyMs ?? _opts.maxLatencyMs,
        failRate:     opts.failRate     ?? _opts.failRate,
        debug:        opts.debug        ?? _opts.debug,
      };
    },
  };

  return adapter;
}

/** The default singleton mock adapter used when no other adapter is set. */
export const mockAdapter: MockAdapter = createMockAdapter();
