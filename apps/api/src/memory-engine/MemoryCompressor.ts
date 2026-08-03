/**
 * memory-engine/MemoryCompressor.ts
 * Compresses memory items by removing duplicates and negligible entries. Pure.
 */
import type { MemoryItem, ImportanceLevel } from './MemoryTypes';

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical: 4, high: 3, medium: 2, low: 1, negligible: 0,
};

/** Remove duplicate keys — keep the highest-confidence item per key */
function deduplicateByKey(items: readonly MemoryItem[]): MemoryItem[] {
  const map = new Map<string, MemoryItem>();
  for (const item of items) {
    const existing = map.get(item.key);
    if (!existing || item.confidence > existing.confidence) {
      map.set(item.key, item);
    }
  }
  return [...map.values()];
}

/** Remove negligible items unless they are the only entry for that key */
function removeNegligible(items: MemoryItem[]): MemoryItem[] {
  const keys = new Set(items.map(i => i.key));
  const multiKey = [...keys].filter(k => items.filter(i => i.key === k).length > 1);
  return items.filter(i => IMPORTANCE_RANK[i.importance] > 0 || !multiKey.includes(i.key));
}

export function compressMemory(items: readonly MemoryItem[]): {
  compressed: MemoryItem[];
  removedCount: number;
} {
  const original = items.length;
  const step1    = deduplicateByKey(items);
  const step2    = removeNegligible(step1);
  return { compressed: step2, removedCount: original - step2.length };
}
