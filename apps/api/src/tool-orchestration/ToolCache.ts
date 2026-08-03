/**
 * tool-orchestration/ToolCache.ts
 *
 * Conversation-scoped result cache.
 *
 * Avoids re-executing identical tool calls within a single conversation turn
 * or across turns (within TTL).
 *
 * Scope: 'conversation'   → keyed by conversationId + tool + params
 *        'organization'   → keyed by organizationId + tool + params
 *        'global'         → keyed by tool + params only
 *
 * PURE data structure — no I/O.
 */

import type { ToolName } from './types';
import type { CacheConfig } from './ToolRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  readonly key:       string;
  readonly value:     unknown;
  readonly cachedAt:  number;    // ms timestamp
  readonly expiresAt: number;    // 0 = never
  readonly tool:      ToolName;
  readonly hitCount:  number;
}

export interface CacheStats {
  readonly hits:      number;
  readonly misses:    number;
  readonly evictions: number;
  readonly size:      number;
  readonly hitRate:   number;   // 0–1
}

// ─── Internal state ───────────────────────────────────────────────────────────

const _cache  = new Map<string, CacheEntry>();
let   _hits   = 0;
let   _misses = 0;
let   _evictions = 0;

// ─── Key generator ────────────────────────────────────────────────────────────

function buildKey(
  tool:           ToolName,
  params:         Record<string, unknown>,
  config:         CacheConfig,
  conversationId: string,
  organizationId: string,
): string {
  // Extract only the key fields that matter for cache differentiation
  const relevantParams: Record<string, unknown> = {};
  for (const field of config.keyFields) {
    if (params[field] !== undefined) {
      relevantParams[field] = params[field];
    }
  }

  const paramStr = JSON.stringify(relevantParams, Object.keys(relevantParams).sort());

  switch (config.scope) {
    case 'conversation': return `conv:${conversationId}:${tool}:${paramStr}`;
    case 'organization': return `org:${organizationId}:${tool}:${paramStr}`;
    case 'global':       return `global:${tool}:${paramStr}`;
  }
}

// ─── Cache API ────────────────────────────────────────────────────────────────

export const ToolCache = {

  /** Look up a cached result. Returns undefined on miss or expiry. */
  get(
    tool:           ToolName,
    params:         Record<string, unknown>,
    config:         CacheConfig,
    conversationId: string,
    organizationId: string,
  ): unknown | undefined {
    if (!config.cacheable) { _misses++; return undefined; }

    const key   = buildKey(tool, params, config, conversationId, organizationId);
    const entry = _cache.get(key);

    if (!entry) { _misses++; return undefined; }

    // Check expiry
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      _cache.delete(key);
      _evictions++;
      _misses++;
      return undefined;
    }

    // Hit — update hit count
    _hits++;
    _cache.set(key, { ...entry, hitCount: entry.hitCount + 1 });
    return entry.value;
  },

  /** Store a result in the cache. */
  set(
    tool:           ToolName,
    params:         Record<string, unknown>,
    value:          unknown,
    config:         CacheConfig,
    conversationId: string,
    organizationId: string,
  ): void {
    if (!config.cacheable) return;

    const key = buildKey(tool, params, config, conversationId, organizationId);
    _cache.set(key, {
      key,
      value,
      cachedAt:  Date.now(),
      expiresAt: config.ttlMs > 0 ? Date.now() + config.ttlMs : 0,
      tool,
      hitCount:  0,
    });
  },

  /** Invalidate all cache entries for a conversation. */
  invalidateConversation(conversationId: string): number {
    const prefix = `conv:${conversationId}:`;
    let count = 0;
    for (const key of _cache.keys()) {
      if (key.startsWith(prefix)) {
        _cache.delete(key);
        count++;
      }
    }
    _evictions += count;
    return count;
  },

  /** Invalidate all cache entries for a specific tool. */
  invalidateTool(tool: ToolName): number {
    let count = 0;
    for (const [key, entry] of _cache.entries()) {
      if (entry.tool === tool) {
        _cache.delete(key);
        count++;
      }
    }
    _evictions += count;
    return count;
  },

  /** Clear all cache entries. */
  flush(): void {
    _evictions += _cache.size;
    _cache.clear();
  },

  /** Current cache statistics. */
  stats(): CacheStats {
    const total = _hits + _misses;
    return {
      hits:      _hits,
      misses:    _misses,
      evictions: _evictions,
      size:      _cache.size,
      hitRate:   total > 0 ? _hits / total : 0,
    };
  },

  /** Reset statistics (for tests). */
  resetStats(): void {
    _hits = 0;
    _misses = 0;
    _evictions = 0;
  },

  /** Snapshot all entries (for introspection / tests). */
  snapshot(): CacheEntry[] {
    return [..._cache.values()];
  },
};
