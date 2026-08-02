/**
 * conversation-engine/cache/BlueprintCache.ts
 * TTL + max-size cache for loaded blueprints.
 */
import type { ConversationBlueprint } from '../types';

interface Entry { blueprint: ConversationBlueprint; expiresAt: number; }

export class BlueprintCache {
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(opts: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs      = opts.ttlMs      ?? 10 * 60 * 1000;
    this.maxEntries = opts.maxEntries ?? 100;
  }

  get(id: string): ConversationBlueprint | null {
    const entry = this.store.get(id);
    if (!entry || Date.now() > entry.expiresAt) { this.store.delete(id); return null; }
    return entry.blueprint;
  }

  set(id: string, blueprint: ConversationBlueprint): void {
    if (this.store.size >= this.maxEntries && !this.store.has(id)) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(id, { blueprint, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(id: string): void { this.store.delete(id); }
  clear(): void { this.store.clear(); }
}

export const blueprintCache = new BlueprintCache();
