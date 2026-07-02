/**
 * validate.ts — Zod request-body and query validation helpers.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '../middleware/errorHandler';

/**
 * Express middleware factory for body validation.
 * Usage: router.post('/register', validate(RegisterSchema), handler)
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return next(new ApiError(422, message, 'VALIDATION_ERROR'));
    }
    req.body = result.data;   // replace body with coerced/trimmed values
    next();
  };
}

/**
 * Parse and validate req.query against a Zod schema.
 * Throws ApiError 422 on invalid input — safe to call inside any controller.
 */
export function parseQuery<T>(schema: ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const message = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new ApiError(422, message, 'VALIDATION_ERROR');
  }
  return result.data;
}
