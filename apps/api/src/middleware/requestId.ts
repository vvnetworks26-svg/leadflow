/**
 * requestId.ts
 *
 * Request tracing middleware.
 *
 * For every incoming request:
 *   1. Generates a UUID with crypto.randomUUID().
 *   2. Attaches it to req.requestId.
 *   3. Sets the X-Request-ID response header.
 *   4. Creates a per-request Pino child logger (req.logger) that
 *      includes the requestId in every log entry automatically.
 *   5. Logs request started and request completed (with timing)
 *      so the full lifecycle is visible in structured logs.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Logger } from 'pino';
import { logger as rootLogger } from '../utils/logger';

// ─── TypeScript augmentation ──────────────────────────────────────────────────
// Extends the Express Request interface so req.requestId and req.logger
// are fully typed throughout the codebase — no `any` required.

declare global {
  namespace Express {
    interface Request {
      /** Unique UUID assigned to every incoming request. */
      requestId: string;
      /** Per-request Pino child logger pre-bound with requestId. */
      logger: Logger;
    }
  }
}

/**
 * requestId middleware.
 *
 * Mount this as the very first middleware in app.ts so every subsequent
 * middleware and handler has access to req.requestId and req.logger.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = randomUUID();

  // Attach to the request so downstream code can reference it
  req.requestId = id;

  // Set the response header immediately — even error responses will carry it
  res.setHeader('X-Request-ID', id);

  // Create a child logger bound to this request's ID
  req.logger = rootLogger.child({ requestId: id });

  // ── Log request started ───────────────────────────────────────────────────
  const startAt = process.hrtime.bigint();
  req.logger.info({ method: req.method, path: req.path }, 'request started');

  // ── Log request completed on response finish ──────────────────────────────
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
    req.logger.info(
      {
        method:       req.method,
        path:         req.path,
        status:       res.statusCode,
        durationMs:   Math.round(durationMs * 100) / 100,
      },
      'request completed'
    );
  });

  next();
}
