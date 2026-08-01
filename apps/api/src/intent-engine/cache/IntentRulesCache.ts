/**
 * intent-engine/cache/IntentRulesCache.ts
 *
 * TTL cache for intent rules and blueprint mappings.
 * Rules rarely change — caching them avoids repeated repository reads.
 * Structurally identical to BusinessIdentityCache for consistency.
 */

import type { IntentKeywordRule, BlueprintMapping } from '../types';

interface RulesCacheEntry {
  rules:     readonly IntentKeywordRule[];
  mappings:  readonly BlueprintMapping[];
  expiresAt: number;
}

export class IntentRulesCache {
  private entry:       RulesCacheEntry | null = null;
  private readonly ttlMs: number;

  constructor(opts: { ttlMs?: number } = {}) {
    this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000;   // 10 minutes default
  }

  get(): { rules: readonly IntentKeywordRule[]; mappings: readonly BlueprintMapping[] } | null {
    if (!this.entry || Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return { rules: this.entry.rules, mappings: this.entry.mappings };
  }

  set(rules: readonly IntentKeywordRule[], mappings: readonly BlueprintMapping[]): void {
    this.entry = { rules, mappings, expiresAt: Date.now() + this.ttlMs };
  }

  invalidate(): void {
    this.entry = null;
  }
}

/** Singleton used by the service */
export const intentRulesCache = new IntentRulesCache();
