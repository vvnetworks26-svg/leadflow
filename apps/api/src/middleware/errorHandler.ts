/**
 * errorHandler.ts — Central error handler and 404 handler.
 *
 * Logging rules:
 *   - Uses req.logger (child logger with requestId) when available,
 *     falls back to the global logger for safety.
 *   - Logs req.path only — never req.url — to avoid query strings in logs.
 *   - Full error details (stack, name, message) logged internally.
 *   - Clients receive only sanitised messages.
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import mongoose from 'mongoose';
import { logger as globalLogger } from '../utils/logger';

/** Structured API error — throw this anywhere in route/controller code. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Use the per-request child logger when available, global logger as fallback. */
function getLogger(req: Request): Logger {
  return (req as any).logger ?? globalLogger;
}

/** Structured request context for log entries — path only, no query string. */
function reqCtx(req: Request) {
  return { method: req.method, path: req.path, requestId: (req as any).requestId };
}

/** 404 handler — mount after all routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
}

/** Central error handler — mount last. */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const log = getLogger(req);

  // ── Known application error ───────────────────────────────────────────────
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status:  'error',
      code:    err.code ?? 'API_ERROR',
      message: err.message,
    });
    return;
  }

  // ── Mongoose ValidationError → 422 ───────────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map(e => e.message);
    log.warn({ err, req: reqCtx(req) }, 'Mongoose validation error');
    res.status(422).json({
      status:  'error',
      code:    'VALIDATION_ERROR',
      message: 'Validation failed',
      errors,
    });
    return;
  }

  // ── Mongoose CastError (invalid ObjectId etc.) → 400 ─────────────────────
  if (err instanceof mongoose.Error.CastError) {
    log.warn({ err, req: reqCtx(req) }, 'Mongoose cast error');
    res.status(400).json({
      status:  'error',
      code:    'INVALID_ID',
      message: 'Invalid resource identifier',
    });
    return;
  }

  // ── MongoDB duplicate key (code 11000/11001) → 409 ───────────────────────
  const mongoErr = err as any;
  if (mongoErr.code === 11000 || mongoErr.code === 11001) {
    log.warn({ err, req: reqCtx(req) }, 'MongoDB duplicate key');
    res.status(409).json({
      status:  'error',
      code:    'DUPLICATE_RESOURCE',
      message: 'Resource already exists',
    });
    return;
  }

  // ── Unhandled / unknown error → 500 ──────────────────────────────────────
  log.error({ err, req: reqCtx(req) }, 'Unhandled error');
  res.status(500).json({
    status:  'error',
    code:    'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
}
