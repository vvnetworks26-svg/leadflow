/**
 * memory-engine/MemoryProfile.ts
 * Builds the immutable MemoryProfile aggregate. Pure function.
 */
import type { MemoryProfile, MemoryItem, ConflictResolution } from './MemoryTypes';
import { summarizeMemory } from './MemorySummarizer';
import { findLowConfidence } from './MemoryRetriever';

export function buildMemoryProfile(params: {
  conversationId:  string;
  organizationId:  string;
  items:           readonly MemoryItem[];
  conflicts:       readonly ConflictResolution[];
}): MemoryProfile {
  const { conversationId, organizationId, items, conflicts } = params;
  const lowConfidenceKeys = findLowConfidence(items).map(i => i.key);
  const summary = summarizeMemory(items);

  return Object.freeze({
    conversationId,
    organizationId,
    items:             Object.freeze([...items]),
    conflicts:         Object.freeze([...conflicts]),
    lowConfidenceKeys: Object.freeze([...new Set(lowConfidenceKeys)]),
    summary,
    generatedAt:       new Date().toISOString(),
  });
}
