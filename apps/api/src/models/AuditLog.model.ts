import { Schema, model, Document } from 'mongoose';

// ─── Event constants ──────────────────────────────────────────────────────────

export const AuditEvent = {
  LOGIN:            'LOGIN',
  LOGIN_FAILED:     'LOGIN_FAILED',
  REGISTER:         'REGISTER',
  TOKEN_REFRESH:    'TOKEN_REFRESH',
  TOKEN_REUSE:      'TOKEN_REUSE',
  LOGOUT:           'LOGOUT',
  SESSION_REVOKED:  'SESSION_REVOKED',
} as const;

export type AuditEventType = typeof AuditEvent[keyof typeof AuditEvent];

// ─── Category constants ───────────────────────────────────────────────────────

export const AuditCategory = {
  AUTH:     'AUTH',
  SESSION:  'SESSION',
  SECURITY: 'SECURITY',
} as const;

export type AuditCategoryType = typeof AuditCategory[keyof typeof AuditCategory];

// ─── Severity levels ──────────────────────────────────────────────────────────

export const AuditSeverity = {
  INFO:     'INFO',
  WARNING:  'WARNING',
  SECURITY: 'SECURITY',
  CRITICAL: 'CRITICAL',
} as const;

export type AuditSeverityType = typeof AuditSeverity[keyof typeof AuditSeverity];

/** Default severity for each event type. */
export const EVENT_SEVERITY: Record<AuditEventType, AuditSeverityType> = {
  LOGIN:           AuditSeverity.INFO,
  LOGIN_FAILED:    AuditSeverity.WARNING,
  REGISTER:        AuditSeverity.INFO,
  TOKEN_REFRESH:   AuditSeverity.INFO,
  TOKEN_REUSE:     AuditSeverity.SECURITY,
  LOGOUT:          AuditSeverity.INFO,
  SESSION_REVOKED: AuditSeverity.SECURITY,
};

// ─── Mongoose document ────────────────────────────────────────────────────────

export interface IAuditLog {
  userId:         string | null;
  organizationId: string | null;
  sessionId:      string | null;
  event:          AuditEventType;
  category:       AuditCategoryType;
  severity:       AuditSeverityType;
  ipAddress:      string;
  userAgent:      string;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface AuditLogDocument extends IAuditLog, Document {}

const AuditLogSchema = new Schema<AuditLogDocument>(
  {
    userId:         { type: String, default: null, index: true },
    organizationId: { type: String, default: null },
    sessionId:      { type: String, default: null, index: true },
    event:          { type: String, required: true, index: true, enum: Object.values(AuditEvent) },
    category:       { type: String, required: true, enum: Object.values(AuditCategory) },
    severity:       { type: String, required: true, enum: Object.values(AuditSeverity) },
    ipAddress:      { type: String, default: '' },
    userAgent:      { type: String, default: '' },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    // createdAt only — no updatedAt (audit records are immutable)
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Compound index for querying a user's recent audit history
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', AuditLogSchema);
