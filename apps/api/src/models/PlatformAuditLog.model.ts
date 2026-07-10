/**
 * PlatformAuditLog.model.ts — Platform-level audit trail.
 */

import { Schema, model, Document } from 'mongoose';

export type PlatformAuditEvent =
  | 'api_key.created' | 'api_key.rotated' | 'api_key.revoked' | 'api_key.used'
  | 'webhook.created' | 'webhook.deleted' | 'webhook.delivered' | 'webhook.failed'
  | 'integration.connected' | 'integration.disconnected'
  | 'app.installed' | 'app.uninstalled' | 'app.updated'
  | 'sso.login' | 'sso.failed' | 'sso.configured'
  | 'white_label.updated' | 'compliance.export' | 'compliance.delete'
  | 'import.completed' | 'export.completed'
  | 'permission.changed' | 'config.changed';

export interface IPlatformAuditLog {
  id:             string;
  organizationId: string;
  event:          PlatformAuditEvent;
  actorId:        string | null;
  actorType:      'user' | 'api_key' | 'system';
  resourceType:   string;
  resourceId:     string | null;
  ipAddress:      string;
  userAgent:      string;
  before:         Record<string, unknown>;
  after:          Record<string, unknown>;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface PlatformAuditLogDocument extends Omit<IPlatformAuditLog, 'id'>, Document {}

const PlatformAuditLogSchema = new Schema<PlatformAuditLogDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    event:          { type: String, required: true, index: true },
    actorId:        { type: String, default: null },
    actorType:      { type: String, enum: ['user','api_key','system'], default: 'user' },
    resourceType:   { type: String, required: true },
    resourceId:     { type: String, default: null },
    ipAddress:      { type: String, default: '' },
    userAgent:      { type: String, default: '' },
    before:         { type: Schema.Types.Mixed, default: {} },
    after:          { type: Schema.Types.Mixed, default: {} },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

PlatformAuditLogSchema.index({ organizationId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ organizationId: 1, actorId: 1 });
// TTL: keep audit logs for 2 years
PlatformAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 365 * 86400 });

export const PlatformAuditLogModel = model<PlatformAuditLogDocument>('PlatformAuditLog', PlatformAuditLogSchema);
