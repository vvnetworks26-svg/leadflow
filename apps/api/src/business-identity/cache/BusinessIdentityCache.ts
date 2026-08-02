/**
 * business-identity/cache/BusinessIdentityCache.ts
 *
 * Lightweight in-process TTL cache for BusinessIdentity objects.
 * Prevents repeated DB round-trips within a single conversation (or short window).
 *
 * Design:
 *   - TTL-based: entries expire after `ttlMs` (default 5 minutes)
 *   - Max-size: LRU eviction when `maxEntries` is reached
 *   - Thread-safe: single-process Node.js is inherently single-threaded
 *   - No external dependencies
 *
 * For multi-instance deployments, replace this with a Redis-backed cache
 * that implements the same IBusinessIdentityCache interface.
 */

import type { BusinessIdentity } from '../types';

export interface IBusinessIdentityCache {
  get(organizationId: string): BusinessIdentity | null;
  set(organizationId: string, identity: BusinessIdentity): void;
  invalidate(organizationId: string): void;
  clear(): void;
}

interface CacheEntry {
  identity:  BusinessIdentity;
  expiresAt: number;
}

export class BusinessIdentityCache implements IBusinessIdentityCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs:      number;
  private readonly maxEntries: number;

  constructor(opts: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs      = opts.ttlMs      ?? 5 * 60 * 1000;   // 5 minutes
    this.maxEntries = opts.maxEntries ?? 200;
  }

  get(organizationId: string): BusinessIdentity | null {
    const entry = this.store.get(organizationId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(organizationId);
      return null;
    }
    return entry.identity;
  }

  set(organizationId: string, identity: BusinessIdentity): void {
    // LRU eviction: remove oldest entry when at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(organizationId)) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }

    this.store.set(organizationId, {
      identity,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(organizationId: string): void {
    this.store.delete(organizationId);
  }

  clear(): void {
    this.store.clear();
  }

  /** Returns the number of non-expired entries currently cached */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const entry of this.store.values()) {
      if (entry.expiresAt > now) count++;
    }
    return count;
  }
}

/** Singleton instance used by the service layer */
export const businessIdentityCache = new BusinessIdentityCache();
