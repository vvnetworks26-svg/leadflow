/**
 * authenticate.ts
 *
 * authenticate()         — verifies the Bearer token, attaches req.user and req.organizationId.
 * authorize(...roles)    — guards routes by role.
 * requireOrganization()  — fails hard (403) if organization context is missing.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/tokens';
import { ApiError } from './errorHandler';
import type { MemberRole } from '../models/Organization.model';

// ─── Augment Express Request ──────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?:           TokenPayload;
      organizationId?: string;
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
 * Attaches req.user (full payload) and req.organizationId (tenant context).
 * Returns 401 if the token is missing, malformed, or expired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) return next(new ApiError(401, 'No authentication token provided', 'NO_TOKEN'));

  try {
    const payload       = verifyAccessToken(token);
    req.user            = payload;
    req.organizationId  = payload.organizationId;
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
export function authorize(...roles: MemberRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated', 'NOT_AUTHENTICATED'));
    if (!roles.includes(req.user.role as MemberRole)) {
      return next(new ApiError(403, 'Insufficient permissions', 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Middleware: asserts that req.organizationId is present.
 * Use after authenticate() on any route that requires a tenant context.
 * This is always satisfied when authenticate() succeeds (since organizationId
 * is embedded in the JWT), but serves as an explicit contract in route chains.
 */
export function requireOrganization(req: Request, _res: Response, next: NextFunction): void {
  if (!req.organizationId) {
    return next(new ApiError(403, 'Organization context is required', 'NO_ORGANIZATION'));
  }
  next();
}
