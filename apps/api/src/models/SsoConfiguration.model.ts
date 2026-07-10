/**
 * SsoConfiguration.model.ts — SSO / SAML / OIDC configuration per org.
 */

import { Schema, model, Document } from 'mongoose';

export type SsoProvider = 'google' | 'microsoft' | 'saml' | 'oidc';

export interface ISsoConfiguration {
  id:             string;
  organizationId: string;
  provider:       SsoProvider;
  isEnabled:      boolean;
  config:         Record<string, unknown>;   // provider-specific (entityId, metadataUrl, clientId, etc.)
  domainRestrictions: string[];             // allowed email domains
  autoProvision:  boolean;                  // create user on first SSO login
  defaultRole:    string;
  lastTestedAt:   Date | null;
  testResult:     string | null;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface SsoConfigurationDocument extends Omit<ISsoConfiguration, 'id'>, Document {}

const SsoConfigurationSchema = new Schema<SsoConfigurationDocument>(
  {
    organizationId:     { type: String, required: true, index: true },
    provider:           { type: String, enum: ['google','microsoft','saml','oidc'], required: true },
    isEnabled:          { type: Boolean, default: false },
    config:             { type: Schema.Types.Mixed, default: {} },
    domainRestrictions: { type: [String], default: [] },
    autoProvision:      { type: Boolean, default: true },
    defaultRole:        { type: String, default: 'agent' },
    lastTestedAt:       { type: Date, default: null },
    testResult:         { type: String, default: null },
    createdById:        { type: String, required: true },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } } }
);

SsoConfigurationSchema.index({ organizationId: 1, provider: 1 }, { unique: true });
export const SsoConfigurationModel = model<SsoConfigurationDocument>('SsoConfiguration', SsoConfigurationSchema);
