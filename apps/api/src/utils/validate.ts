/**
 * validate.ts — Zod request-body validation helper.
 * Returns a typed result; the caller decides how to handle the error.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../middleware/errorHandler';

/**
 * Express middleware factory.
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
