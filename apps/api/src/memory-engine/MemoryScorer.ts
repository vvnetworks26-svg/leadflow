/**
 * memory-engine/MemoryScorer.ts
 * Builds MemoryItem objects from raw field data. Pure function.
 *
 * BUG-H1 FIX: IDs are now deterministic (djb2 hash of key).
 * The same field always produces the same ID within a session,
 * enabling stable deduplication and conflict resolution across
 * multiple MemoryEngine.process() calls.
 */
import type { MemoryItem } from './MemoryTypes';
import { classifyField }          from './MemoryClassifier';
import { scoreImportance, toImportanceLevel } from './MemoryImportance';
import { assignRetention }        from './MemoryRetention';

/**
 * Deterministic ID from field key using djb2 hash.
 * Identical to stableMemoryId() in tool-orchestration/MemoryBugFixes.ts
 * but kept inline here to avoid a cross-layer import.
 */
function deterministicId(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) + key.charCodeAt(i);
    hash = hash & hash; // keep 32-bit
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `mem-${hex}`;
}

export function buildMemoryItem(params: {
  key:        string;
  value:      unknown;
  confidence: number;
  source:     MemoryItem['source'];
  tags?:      string[];
}): MemoryItem {
  const { key, value, confidence, source, tags = [] } = params;
  const domain         = classifyField(key);
  const importanceScore = scoreImportance(key, confidence);
  const importance     = toImportanceLevel(importanceScore);
  const retention      = assignRetention(key, importance);
  const needsRevalidation = confidence < 50;

  return Object.freeze({
    id:               deterministicId(key),   // BUG-H1 fix: was randomUUID()
    domain,
    key,
    value,
    confidence,
    importance,
    importanceScore,
    retention,
    source,
    needsRevalidation,
    tags:             Object.freeze([...tags]),
    createdAt:        new Date().toISOString(),
  });
}
