/**
 * ComplianceRecord.model.ts — GDPR/CCPA consent and audit records.
 */

import { Schema, model, Document } from 'mongoose';

export type ComplianceEventType =
  | 'consent_given' | 'consent_withdrawn' | 'data_export_requested' | 'data_deleted'
  | 'data_accessed' | 'policy_accepted' | 'right_to_be_forgotten' | 'data_breach_logged'
  | 'retention_expired' | 'scim_provisioned' | 'scim_deprovisioned';

export interface IComplianceRecord {
  organizationId: string;
  eventType:      ComplianceEventType;
  userId:         string | null;
  leadId:         string | null;
  ipAddress:      string;
  userAgent:      string;
  details:        Record<string, unknown>;
  regulation:     'GDPR' | 'CCPA' | 'HIPAA' | 'SOC2' | 'GENERAL';
  createdAt:      Date;
}

export interface ComplianceRecordDocument extends IComplianceRecord, Document {}

const ComplianceRecordSchema = new Schema<ComplianceRecordDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    eventType:      { type: String, required: true, index: true },
    userId:         { type: String, default: null },
    leadId:         { type: String, default: null },
    ipAddress:      { type: String, default: '' },
    userAgent:      { type: String, default: '' },
    details:        { type: Schema.Types.Mixed, default: {} },
    regulation:     { type: String, enum: ['GDPR','CCPA','HIPAA','SOC2','GENERAL'], default: 'GENERAL' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

ComplianceRecordSchema.index({ organizationId: 1, createdAt: -1 });
ComplianceRecordSchema.index({ organizationId: 1, eventType: 1 });
export const ComplianceRecordModel = model<ComplianceRecordDocument>('ComplianceRecord', ComplianceRecordSchema);
