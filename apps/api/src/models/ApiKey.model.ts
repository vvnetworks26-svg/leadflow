/**
 * ApiKey.model.ts — API keys with scopes, expiration, and usage tracking.
 * The raw key is only returned once on creation. Stored as SHA-256 hash.
 */

import { Schema, model, Document } from 'mongoose';

export type ApiKeyScope = 'leads:read' | 'leads:write' | 'bookings:read' | 'bookings:write' |
  'conversations:read' | 'conversations:write' | 'analytics:read' | 'agents:write' |
  'campaigns:write' | 'webhooks:manage' | 'full_access';

export interface IApiKey {
  id:             string;
  organizationId: string;
  name:           string;
  keyHash:        string;       // SHA-256 of raw key (select: false)
  keyPrefix:      string;       // first 8 chars for display (lf_xxxxx...)
  scopes:         ApiKeyScope[];
  expiresAt:      Date | null;
  lastUsedAt:     Date | null;
  lastUsedIp:     string | null;
  usageCount:     number;
  rateLimit:      number;       // requests per minute (0 = unlimited)
  isActive:       boolean;
  createdById:    string;
  revokedAt:      Date | null;
  revokedById:    string | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface ApiKeyDocument extends Omit<IApiKey, 'id'>, Document {}

const ApiKeySchema = new Schema<ApiKeyDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    keyHash:        { type: String, required: true, unique: true, select: false },
    keyPrefix:      { type: String, required: true },
    scopes:         { type: [String], default: [] },
    expiresAt:      { type: Date, default: null },
    lastUsedAt:     { type: Date, default: null },
    lastUsedIp:     { type: String, default: null },
    usageCount:     { type: Number, default: 0 },
    rateLimit:      { type: Number, default: 0 },
    isActive:       { type: Boolean, default: true },
    createdById:    { type: String, required: true },
    revokedAt:      { type: Date, default: null },
    revokedById:    { type: String, default: null },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).keyHash;
        return ret;
      },
    },
  }
);

ApiKeySchema.index({ organizationId: 1, isActive: 1 });

export const ApiKeyModel = model<ApiKeyDocument>('ApiKey', ApiKeySchema);
