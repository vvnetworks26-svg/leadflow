/**
 * errorHandler.ts — Central error handler and 404 handler.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

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

/** 404 handler — mount after all routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

/** Central error handler — mount last. */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code ?? 'API_ERROR',
      message: err.message,
    });
    return;
  }

  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
