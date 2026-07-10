/**
 * Integration.model.ts — Third-party integration connections per org.
 */

import { Schema, model, Document } from 'mongoose';

export type IntegrationProvider =
  | 'google_workspace' | 'microsoft_365' | 'slack' | 'teams' | 'zoom'
  | 'quickbooks' | 'xero' | 'hubspot' | 'salesforce' | 'zapier' | 'make'
  | 'generic_rest' | 'custom';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface IIntegration {
  id:             string;
  organizationId: string;
  provider:       IntegrationProvider;
  name:           string;
  status:         IntegrationStatus;
  config:         Record<string, unknown>;   // provider-specific config
  credentials:    Record<string, unknown>;   // select: false
  webhookUrl:     string;
  syncEnabled:    boolean;
  lastSyncAt:     Date | null;
  errorMessage:   string | null;
  metadata:       Record<string, unknown>;
  installedById:  string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface IntegrationDocument extends Omit<IIntegration, 'id'>, Document {}

const IntegrationSchema = new Schema<IntegrationDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    provider:       { type: String, required: true },
    name:           { type: String, required: true },
    status:         { type: String, enum: ['connected','disconnected','error','pending'], default: 'disconnected' },
    config:         { type: Schema.Types.Mixed, default: {} },
    credentials:    { type: Schema.Types.Mixed, default: {}, select: false },
    webhookUrl:     { type: String, default: '' },
    syncEnabled:    { type: Boolean, default: true },
    lastSyncAt:     { type: Date, default: null },
    errorMessage:   { type: String, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
    installedById:  { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; delete (ret as any).credentials; return ret; } },
  }
);

IntegrationSchema.index({ organizationId: 1, provider: 1 });
export const IntegrationModel = model<IntegrationDocument>('Integration', IntegrationSchema);
