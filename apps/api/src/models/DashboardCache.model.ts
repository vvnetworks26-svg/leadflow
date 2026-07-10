/**
 * DashboardCache.model.ts
 *
 * Caches computed dashboard metric aggregations.
 * TTL-indexed — stale entries auto-expire.
 * Key = organizationId + cacheKey.
 */

import { Schema, model, Document } from 'mongoose';

export interface IDashboardCache {
  organizationId: string;
  cacheKey:       string;       // e.g. 'overview:2026-07-08'
  data:           Record<string, unknown>;
  computedAt:     Date;
  expiresAt:      Date;
}

export interface DashboardCacheDocument extends IDashboardCache, Document {}

const DashboardCacheSchema = new Schema<DashboardCacheDocument>(
  {
    organizationId: { type: String, required: true },
    cacheKey:       { type: String, required: true },
    data:           { type: Schema.Types.Mixed, default: {} },
    computedAt:     { type: Date, default: Date.now },
    expiresAt:      { type: Date, required: true },
  },
  { versionKey: false }
);

DashboardCacheSchema.index({ organizationId: 1, cacheKey: 1 }, { unique: true });
DashboardCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DashboardCacheModel = model<DashboardCacheDocument>('DashboardCache', DashboardCacheSchema);
