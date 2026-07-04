/**
 * transport/pipeline.ts
 *
 * Assembles the full request execution pipeline:
 *
 *   beforeRequest middleware (in order)
 *     ↓
 *   adapter.execute()
 *     ↓
 *   afterResponse middleware (in reverse — innermost first)
 *     ↓
 *   error handler (re-wraps any non-TransportError)
 *
 * The pipeline is the only place that calls adapter.execute().
 * The client delegates here — it never calls the adapter directly.
 */

import { composeMiddleware }                from './middleware';
import { isTransportError, NetworkError } from './errors';
import type {
  TransportRequest,
  TransportResponse,
  TransportAdapter,
  TransportMiddleware,
  TransportContext,
} from './types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a request through the full pipeline.
 *
 * @param request     - The immutable request to execute.
 * @param adapter     - The adapter that performs actual I/O.
 * @param middlewares - Registered middleware, in registration order.
 * @returns The resolved response.
 * @throws  TransportError (or subclass) on any failure.
 */
export async function runPipeline<T>(
  request:     TransportRequest,
  adapter:     TransportAdapter,
  middlewares: TransportMiddleware[]
): Promise<TransportResponse<T>> {

  // Build context — middleware and the adapter both read/write here
  const ctx: TransportContext<T> = {
    request,
    response: null,
    meta:     {},
  };

  // The inner-most function: call the adapter
  const adapterFn = async (c: TransportContext<T>): Promise<void> => {
    c.response = await adapter.execute<T>(c.request);
  };

  // Compose all middleware around the adapter
  const pipeline = composeMiddleware<T>(
    middlewares as TransportMiddleware<T>[],
    adapterFn
  );

  try {
    await pipeline(ctx);
  } catch (err) {
    // Re-wrap any non-TransportError so callers always get a typed error
    if (isTransportError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new NetworkError(ctx.request, msg);
  }

  if (!ctx.response) {
    throw new NetworkError(ctx.request, 'Pipeline completed with no response');
  }

  return ctx.response;
}
