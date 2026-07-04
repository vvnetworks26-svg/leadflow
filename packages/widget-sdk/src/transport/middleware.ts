/**
 * transport/middleware.ts
 *
 * Middleware composition utilities.
 *
 * Middleware functions follow the Koa-style pattern:
 *   async (ctx, next) => {
 *     // before adapter
 *     await next();
 *     // after adapter
 *   }
 *
 * Rules:
 *   - Middleware must call next() exactly once (or not at all to short-circuit).
 *   - Errors thrown in middleware propagate to the pipeline error handler.
 *   - Middleware is composable — compose(a, b, c) builds a chain.
 */

import type { TransportMiddleware, TransportContext } from './types';

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * Compose an array of middleware functions into a single function.
 * Execution order: first registered → last registered (Koa-style).
 *
 * @param middlewares - Ordered array of middleware functions.
 * @param finalFn     - The inner-most function (typically the adapter call).
 */
export function composeMiddleware<T>(
  middlewares: TransportMiddleware<T>[],
  finalFn:     (ctx: TransportContext<T>) => Promise<void>
): (ctx: TransportContext<T>) => Promise<void> {
  return async function dispatch(ctx: TransportContext<T>): Promise<void> {
    let index = -1;

    async function next(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times in the same middleware');
      }
      index = i;

      if (i < middlewares.length) {
        await middlewares[i](ctx, () => next(i + 1));
      } else {
        await finalFn(ctx);
      }
    }

    await next(0);
  };
}

// ─── Built-in middleware factories ────────────────────────────────────────────

/**
 * Request ID middleware.
 * Stamps the request ID into ctx.meta for downstream access.
 * This is a lightweight example — not added by default to the client.
 */
export function requestIdMiddleware<T>(): TransportMiddleware<T> {
  return async (ctx, next) => {
    ctx.meta['requestId'] = ctx.request.id;
    await next();
  };
}

/**
 * Timing middleware.
 * Records the round-trip time in ctx.meta['durationMs'].
 */
export function timingMiddleware<T>(): TransportMiddleware<T> {
  return async (ctx, next) => {
    const start = Date.now();
    await next();
    ctx.meta['durationMs'] = Date.now() - start;
  };
}
