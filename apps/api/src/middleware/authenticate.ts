/**
 * authenticate.ts
 *
 * authenticate() — verifies the Bearer token and attaches req.user.
 * authorize(...roles) — guards routes by role.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/tokens';
import { ApiError } from './errorHandler';

// Augment the Express Request type so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/** Extract Bearer token from Authorization header. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/**
 * Middleware: verifies the access token.
 * Attaches the decoded payload to req.user.
 * Returns 401 if the token is missing, malformed, or expired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) return next(new ApiError(401, 'No authentication token provided', 'NO_TOKEN'));

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new ApiError(401, 'Token is invalid or expired', 'INVALID_TOKEN'));
  }
}

/**
 * Middleware factory: restricts access to the specified roles.
 * Must be used after authenticate().
 *
 * Usage: router.get('/admin', authenticate, authorize('admin', 'owner'), handler)
 */
export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated', 'NOT_AUTHENTICATED'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }
    next();
  };
}
