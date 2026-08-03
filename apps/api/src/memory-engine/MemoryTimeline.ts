/**
 * memory-engine/MemoryTimeline.ts
 * Determines which memories are still valid based on retention policy. Pure.
 */
import type { MemoryItem, RetentionPolicy } from './MemoryTypes';

const RETENTION_MS: Record<RetentionPolicy, number | null> = {
  session:   0,          // handled externally
  '30_days': 30  * 24 * 60 * 60 * 1000,
  '90_days': 90  * 24 * 60 * 60 * 1000,
  '1_year':  365 * 24 * 60 * 60 * 1000,
  permanent: null,       // never expires
};

export function isExpired(item: MemoryItem, nowMs = Date.now()): boolean {
  if (item.retention === 'permanent') return false;
  if (item.retention === 'session')   return false; // session managed externally
  const ttl = RETENTION_MS[item.retention];
  if (ttl === null) return false;
  const age = nowMs - new Date(item.createdAt).getTime();
  return age > ttl;
}

export function filterActive(items: readonly MemoryItem[], nowMs = Date.now()): MemoryItem[] {
  return items.filter(i => !isExpired(i, nowMs));
}

export function expiresAt(item: MemoryItem): Date | null {
  const ttl = RETENTION_MS[item.retention];
  if (ttl === null || ttl === 0) return null;
  return new Date(new Date(item.createdAt).getTime() + ttl);
}
