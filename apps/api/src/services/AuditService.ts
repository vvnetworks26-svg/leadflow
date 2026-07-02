/**
 * AuditService.ts
 *
 * Permanent security event history for compliance and debugging.
 * This is NOT application logging (Pino) — audit records persist in MongoDB
 * and form a queryable history of authentication lifecycle events.
 *
 * Design principles:
 *   - All writes are fire-and-forget (non-blocking). A failure to write an
 *     audit record must NEVER cause an auth operation to fail.
 *   - All public helpers call the single generic log() method.
 *   - No controller or route should ever import this service directly;
 *     it is called only from AuthService.
 */

import { logger } from '../utils/logger';
import {
  AuditLogModel,
  AuditEvent,
  AuditCategory,
  AuditSeverity,
  AuditSeverityType,
  AuditCategoryType,
  AuditEventType,
  EVENT_SEVERITY,
} from '../models/AuditLog.model';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditContext {
  userId?:         string | null;
  sessionId?:      string | null;
  ipAddress?:      string;
  userAgent?:      string;
  organizationId?: string | null;
  metadata?:       Record<string, unknown>;
}

interface LogParams extends AuditContext {
  event:    AuditEventType;
  category: AuditCategoryType;
  severity?: AuditSeverityType;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export const AuditService = {
  /**
   * Generic audit record writer.
   * All other helpers delegate here.
   * Fire-and-forget — errors are logged but never rethrown.
   */
  log(params: LogParams): void {
    const severity = params.severity ?? EVENT_SEVERITY[params.event];

    AuditLogModel.create({
      userId:         params.userId         ?? null,
      organizationId: params.organizationId ?? null,
      sessionId:      params.sessionId      ?? null,
      event:          params.event,
      category:       params.category,
      severity,
      ipAddress:      params.ipAddress ?? '',
      userAgent:      params.userAgent ?? '',
      metadata:       params.metadata  ?? {},
    }).catch((err: unknown) => {
      // Audit write failure must never break the auth flow
      logger.warn({ err, event: params.event }, 'Audit log write failed');
    });
  },

  // ─── Auth lifecycle helpers ────────────────────────────────────────────────

  logLogin(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.LOGIN,
      category: AuditCategory.AUTH,
      ...ctx,
    });
  },

  logFailedLogin(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.LOGIN_FAILED,
      category: AuditCategory.AUTH,
      ...ctx,
    });
  },

  logRegister(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.REGISTER,
      category: AuditCategory.AUTH,
      ...ctx,
    });
  },

  logRefresh(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.TOKEN_REFRESH,
      category: AuditCategory.SESSION,
      ...ctx,
    });
  },

  logTokenReuse(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.TOKEN_REUSE,
      category: AuditCategory.SECURITY,
      ...ctx,
    });
  },

  logLogout(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.LOGOUT,
      category: AuditCategory.SESSION,
      ...ctx,
    });
  },

  logSessionRevoked(ctx: AuditContext): void {
    AuditService.log({
      event:    AuditEvent.SESSION_REVOKED,
      category: AuditCategory.SECURITY,
      ...ctx,
    });
  },
};
