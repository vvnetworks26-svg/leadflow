/**
 * transport/adapters/fetch.ts
 *
 * Production Fetch Adapter — the ONLY place in the SDK that calls fetch().
 *
 * Implements TransportAdapter using the browser's native fetch() API.
 * Drop-in replacement for MockAdapter:
 *   sdk.setTransportAdapter(createFetchAdapter());
 *
 * ─── Request lifecycle ────────────────────────────────────────────────────────
 *
 *   1. Build URL — append query params from request.query
 *   2. Build headers — merge request.headers + Content-Type for JSON bodies
 *   3. Serialise body — JSON.stringify for POST/PUT/PATCH bodies
 *   4. Set up timeout — AbortController with setTimeout, merged with caller's signal
 *   5. Call fetch()
 *   6. On success — parse body (JSON / text / null for 204 / ArrayBuffer fallback)
 *   7. Record duration and requestId, return frozen TransportResponse
 *   8. On any error — map to TransportError subclass, never expose browser errors
 *
 * ─── Response parsing ─────────────────────────────────────────────────────────
 *
 *   Content-Type: application/json  → JSON.parse → object
 *   Content-Type: text/*            → text string
 *   Status 204 No Content           → null
 *   Anything else                   → ArrayBuffer (raw bytes, documented choice)
 *
 * ─── Error mapping ────────────────────────────────────────────────────────────
 *
 *   signal.aborted (timeout-caused)  → TimeoutError
 *   signal.aborted (caller-caused)   → AbortError
 *   fetch() throws TypeError         → NetworkError  (offline / CORS / DNS)
 *   response.ok === false            → HttpError
 *   Any other throw                  → NetworkError  (re-wrapped)
 *
 * ─── Diagnostics ─────────────────────────────────────────────────────────────
 *
 *   lastFetchDuration   — milliseconds for the last completed request
 *   lastStatusCode      — HTTP status from the last response
 *   lastResponseSize    — Content-Length header value, or null
 *
 * ─── Constraints ─────────────────────────────────────────────────────────────
 *   No authentication headers added here.
 *   No retry logic.
 *   No request queue.
 *   No offline detection.
 */

import { buildResponse }                                 from '../response';
import {
  TimeoutError,
  NetworkError,
  AbortError,
  HttpError,
}                                                        from '../errors';
import type { TransportAdapter, TransportRequest, TransportResponse } from '../types';

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface FetchAdapterDiagnostics {
  /** Duration of the most recent fetch in milliseconds. Null before first request. */
  lastFetchDuration:  number | null;
  /** HTTP status code of the most recent response. Null before first request. */
  lastStatusCode:     number | null;
  /**
   * Value of the Content-Length response header as a number.
   * Null if the header was absent or the last request failed.
   */
  lastResponseSize:   number | null;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface FetchAdapterOptions {
  /**
   * Base URL prepended to relative request URLs.
   * Example: 'https://api.leadflow.ai'
   * When omitted, request.url is used as-is.
   */
  baseUrl?: string;

  /**
   * Default headers merged into every request.
   * Request-level headers take precedence.
   */
  defaultHeaders?: Record<string, string>;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface FetchAdapter extends TransportAdapter {
  /** Diagnostic counters for this adapter instance. */
  readonly diagnostics: FetchAdapterDiagnostics;
  /** Update adapter options at runtime. */
  configure(opts: FetchAdapterOptions): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Append query parameters to a URL string.
 * Returns the URL unchanged if query is empty.
 */
function buildUrl(url: string, query: Readonly<Record<string, string>>): string {
  const entries = Object.entries(query);
  if (entries.length === 0) return url;

  const params = new URLSearchParams();
  for (const [k, v] of entries) {
    params.append(k, v);
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params.toString()}`;
}

/**
 * Parse the browser Response body based on Content-Type.
 *
 * | Content-Type         | Returns      |
 * |----------------------|--------------|
 * | application/json     | object       |
 * | text/*               | string       |
 * | status === 204       | null         |
 * | anything else        | ArrayBuffer  |
 */
async function parseBody(response: Response): Promise<unknown> {
  // 204 No Content — no body to read
  if (response.status === 204) return null;

  const ct = response.headers.get('content-type') ?? '';

  if (ct.includes('application/json')) {
    return response.json();
  }

  if (ct.startsWith('text/')) {
    return response.text();
  }

  // Unknown content type — return raw bytes
  return response.arrayBuffer();
}

/**
 * Extract response headers into a plain frozen record.
 * Only includes headers with non-null values.
 */
function extractHeaders(response: Response): Record<string, string> {
  const result: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createFetchAdapter(options: FetchAdapterOptions = {}): FetchAdapter {
  let _baseUrl        = options.baseUrl        ?? '';
  let _defaultHeaders = options.defaultHeaders ?? {};

  const _diag: FetchAdapterDiagnostics = {
    lastFetchDuration: null,
    lastStatusCode:    null,
    lastResponseSize:  null,
  };

  const adapter: FetchAdapter = {
    name: 'fetch',

    get diagnostics(): FetchAdapterDiagnostics {
      return _diag;
    },

    configure(opts: FetchAdapterOptions): void {
      if (opts.baseUrl        !== undefined) _baseUrl        = opts.baseUrl;
      if (opts.defaultHeaders !== undefined) _defaultHeaders = opts.defaultHeaders;
    },

    async execute<T>(request: TransportRequest): Promise<TransportResponse<T>> {
      const startedAt = Date.now();

      // ── 1. Build URL ─────────────────────────────────────────────────────
      const rawUrl  = _baseUrl ? `${_baseUrl.replace(/\/$/, '')}/${request.url.replace(/^\//, '')}` : request.url;
      const fullUrl = buildUrl(rawUrl, request.query);

      // ── 2. Set up timeout + abort signal merging ──────────────────────────
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      const controller = new AbortController();

      // Forward caller's external signal into our controller
      if (request.signal) {
        if (request.signal.aborted) {
          throw new AbortError(request);
        }
        request.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      if (request.timeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, request.timeout);
      }

      // ── 3. Build headers ─────────────────────────────────────────────────
      const headers: Record<string, string> = {
        ..._defaultHeaders,
        ...request.headers,
      };

      // Add Content-Type for requests with a JSON body
      const hasBody = request.body !== null &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

      if (hasBody && !headers['content-type']) {
        headers['content-type'] = 'application/json';
      }

      // ── 4. Build RequestInit ──────────────────────────────────────────────
      const init: RequestInit = {
        method:  request.method,
        headers,
        signal:  controller.signal,
      };

      if (hasBody && request.body !== null) {
        init.body = JSON.stringify(request.body);
      }

      // ── 5. Execute fetch ─────────────────────────────────────────────────
      let browserResponse: Response;

      try {
        browserResponse = await fetch(fullUrl, init);
      } catch (err) {
        if (timeoutId !== null) clearTimeout(timeoutId);

        // Classify abort errors
        if (controller.signal.aborted) {
          if (timedOut) {
            throw new TimeoutError(request, request.timeout);
          }
          throw new AbortError(request);
        }

        // TypeError from fetch = network failure (offline, CORS, bad URL, etc.)
        const msg = err instanceof Error ? err.message : String(err);
        throw new NetworkError(request, msg);
      }

      if (timeoutId !== null) clearTimeout(timeoutId);

      // ── 6. Parse response body ────────────────────────────────────────────
      let body: unknown;
      try {
        body = await parseBody(browserResponse);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new NetworkError(request, `Failed to parse response body: ${msg}`);
      }

      const duration = Date.now() - startedAt;
      const headers_ = extractHeaders(browserResponse);

      // ── 7. Record diagnostics ─────────────────────────────────────────────
      _diag.lastFetchDuration = duration;
      _diag.lastStatusCode    = browserResponse.status;
      _diag.lastResponseSize  = browserResponse.headers.has('content-length')
        ? Number(browserResponse.headers.get('content-length'))
        : null;

      // ── 8. Build immutable response ───────────────────────────────────────
      const response = buildResponse<T>({
        status:    browserResponse.status,
        headers:   headers_,
        body:      body as T,
        duration,
        requestId: request.id,
      });

      // ── 9. Map non-2xx to HttpError ───────────────────────────────────────
      if (!browserResponse.ok) {
        throw new HttpError(request, response as TransportResponse<unknown>);
      }

      return response;
    },
  };

  return adapter;
}
