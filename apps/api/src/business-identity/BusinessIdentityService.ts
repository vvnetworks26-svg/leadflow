/**
 * business-identity/BusinessIdentityService.ts
 *
 * Application service — the single entry point for loading BusinessIdentity.
 * Orchestrates: cache → repository → factory.
 *
 * Consumers call BusinessIdentityService.load(organizationId).
 * They never interact with the repository or cache directly.
 *
 * Usage in orchestrator:
 *   const identity = await BusinessIdentityService.load(organizationId);
 *   if (!identity) { use safe defaults }
 */

import { businessIdentityCache }            from './cache/BusinessIdentityCache';
import { MongoBusinessIdentityRepository }  from './repository/MongoBusinessIdentityRepository';
import type { BusinessIdentity }            from './types';
import type { IBusinessIdentityRepository } from './repository/BusinessIdentityRepository';
import { logger }                           from '../utils/logger';

// ─── Singleton repository ─────────────────────────────────────────────────────

let _repository: IBusinessIdentityRepository = new MongoBusinessIdentityRepository();

/**
 * Override the repository implementation (for testing or alternative storage).
 * Call this at startup before any load() calls.
 */
export function setRepository(repo: IBusinessIdentityRepository): void {
  _repository = repo;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const BusinessIdentityService = {

  /**
   * Load a BusinessIdentity for the given organizationId.
   *
   * Flow:
   *   1. Check in-process cache
   *   2. Load from MongoDB via repository
   *   3. Store in cache
   *   4. Return identity (or null if org not found)
   *
   * Never throws — errors are logged and null is returned so the
   * orchestrator can fall back to safe defaults.
   */
  async load(organizationId: string): Promise<BusinessIdentity | null> {
    // 1. Cache hit
    const cached = businessIdentityCache.get(organizationId);
    if (cached) return cached;

    // 2. Repository load
    try {
      const identity = await _repository.loadByOrganizationId(organizationId);
      if (!identity) return null;

      // 3. Cache for subsequent calls
      businessIdentityCache.set(organizationId, identity);
      return identity;
    } catch (err) {
      logger.error({ err, organizationId }, '[BusinessIdentityService] Failed to load identity');
      return null;
    }
  },

  /**
   * Force a cache refresh for the given organizationId.
   * Call this when business settings are updated.
   */
  async refresh(organizationId: string): Promise<BusinessIdentity | null> {
    businessIdentityCache.invalidate(organizationId);
    return BusinessIdentityService.load(organizationId);
  },

  /** Invalidate cached identity without reloading */
  invalidate(organizationId: string): void {
    businessIdentityCache.invalidate(organizationId);
  },
};
