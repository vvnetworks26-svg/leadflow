/**
 * DashboardCache.ts
 *
 * Simple write-through cache for expensive dashboard aggregations.
 * TTLs: 5 min for real-time widgets, 1 hour for historical charts.
 * Falls through to the compute function on cache miss.
 */

import { DashboardCacheModel } from '../../models/DashboardCache.model';
import { logger }              from '../../utils/logger';

export const TTL = {
  REALTIME:   5  * 60_000,   // 5 minutes
  SHORT:      15 * 60_000,   // 15 minutes
  MEDIUM:     60 * 60_000,   // 1 hour
  LONG:       4  * 3600_000, // 4 hours
  DAY:        24 * 3600_000, // 24 hours
};

/**
 * Get cached value, or compute and cache if missing/expired.
 */
export async function cached<T>(
  organizationId: string,
  key:            string,
  ttlMs:          number,
  compute:        () => Promise<T>,
): Promise<T> {
  const now = new Date();
  try {
    const hit = await DashboardCacheModel.findOne({
      organizationId, cacheKey: key, expiresAt: { $gt: now },
    }).lean();
    if (hit) return hit.data as unknown as T;
  } catch { /* non-blocking */ }

  const data = await compute();

  DashboardCacheModel.findOneAndUpdate(
    { organizationId, cacheKey: key },
    {
      organizationId,
      cacheKey:    key,
      data:        data as unknown as Record<string, unknown>,
      computedAt:  now,
      expiresAt:   new Date(now.getTime() + ttlMs),
    },
    { upsert: true }
  ).catch((err: unknown) => logger.warn({ err }, '[Cache] write failed'));

  return data;
}

/**
 * Invalidate a specific cache key or all keys for an org.
 */
export async function invalidate(organizationId: string, keyPattern?: string): Promise<void> {
  const filter: Record<string, unknown> = { organizationId };
  if (keyPattern) filter.cacheKey = { $regex: keyPattern };
  await DashboardCacheModel.deleteMany(filter);
}
