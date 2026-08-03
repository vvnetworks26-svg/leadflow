/**
 * memory-engine/MemoryEngine.ts
 *
 * Layer 6 — Memory Intelligence Engine.
 * Single entry point: MemoryEngine.process()
 *
 * Pure. No DB. No LLM. No side effects.
 */

import type { RichConversationMemory } from '../ai/types';
import type { MemoryItem, MemoryProfile, ConflictResolution, RetrievalQuery } from './MemoryTypes';
import { buildMemoryItem }         from './MemoryScorer';
import { resolveConflict }         from './MemoryConflictResolver';
import { filterActive }            from './MemoryTimeline';
import { compressMemory }          from './MemoryCompressor';
import { retrieveForContext, findLowConfidence } from './MemoryRetriever';
import { buildMemoryProfile }      from './MemoryProfile';

// ─── Rich memory → MemoryItem[] extractor ────────────────────────────────────

function extractItems(memory: RichConversationMemory): MemoryItem[] {
  const items: MemoryItem[] = [];
  const r = memory.rich;

  const richFields: Array<{ key: string; field: { value: unknown; confidence: number; source: MemoryItem['source'] | null } }> = [
    { key: 'visitorName',   field: r.visitorName },
    { key: 'company',       field: r.company },
    { key: 'phone',         field: r.phone },
    { key: 'email',         field: r.email },
    { key: 'address',       field: r.address },
    { key: 'zip',           field: r.zip },
    { key: 'industry',      field: r.industry },
    { key: 'employeeCount', field: r.employeeCount },
    { key: 'budget',        field: r.budget },
    { key: 'timeline',      field: r.timeline },
    { key: 'service',       field: r.service },
    { key: 'emergency',     field: r.emergency },
    { key: 'preferredTime', field: r.preferredTime },
  ];

  for (const { key, field } of richFields) {
    if (field.value !== null && field.value !== undefined) {
      items.push(buildMemoryItem({
        key,
        value:      field.value,
        confidence: field.confidence || 60,
        source:     (field.source as MemoryItem['source']) ?? 'user',
      }));
    }
  }

  // Flat / array fields
  if (memory.bookingStatus && memory.bookingStatus !== 'none') {
    items.push(buildMemoryItem({ key: 'bookingStatus', value: memory.bookingStatus, confidence: 95, source: 'user' }));
  }
  if (memory.painPoints.length > 0) {
    items.push(buildMemoryItem({ key: 'painPoints', value: memory.painPoints, confidence: 75, source: 'context' }));
  }
  if (memory.goals.length > 0) {
    items.push(buildMemoryItem({ key: 'goals', value: memory.goals, confidence: 70, source: 'context' }));
  }
  if (memory.objections.length > 0) {
    items.push(buildMemoryItem({ key: 'objections', value: memory.objections, confidence: 80, source: 'context' }));
  }
  if (memory.servicesDiscussed.length > 0) {
    items.push(buildMemoryItem({ key: 'servicesDiscussed', value: memory.servicesDiscussed, confidence: 85, source: 'context' }));
  }
  if (memory.location) {
    items.push(buildMemoryItem({ key: 'location', value: memory.location, confidence: 65, source: 'user' }));
  }

  return items;
}

// ─── Conflict detection ───────────────────────────────────────────────────────

function detectAndResolveConflicts(
  existing: readonly MemoryItem[],
  incoming: MemoryItem[],
): { resolved: MemoryItem[]; conflicts: ConflictResolution[] } {
  const map    = new Map<string, MemoryItem>(existing.map(i => [i.key, i]));
  const result: MemoryItem[] = [...existing];
  const conflicts: ConflictResolution[] = [];

  for (const item of incoming) {
    const prev = map.get(item.key);
    if (!prev) {
      result.push(item);
      map.set(item.key, item);
    } else if (prev.value !== item.value || prev.confidence !== item.confidence) {
      const resolution = resolveConflict(prev, item);
      conflicts.push(resolution);
      // Replace in result
      const idx = result.findIndex(r => r.key === item.key);
      if (idx >= 0) result[idx] = resolution.resolved;
      map.set(item.key, resolution.resolved);
    }
  }

  return { resolved: result, conflicts };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const MemoryEngine = {

  /**
   * Primary entry point. Converts RichConversationMemory into a MemoryProfile.
   * Pure — no side effects, no I/O.
   */
  process(params: {
    memory:           RichConversationMemory;
    conversationId:   string;
    organizationId:   string;
    existingItems?:   readonly MemoryItem[];
  }): MemoryProfile {
    const { memory, conversationId, organizationId, existingItems = [] } = params;

    // 1. Extract MemoryItems from rich memory
    const incoming = extractItems(memory);

    // 2. Filter active existing items (not expired)
    const active = filterActive(existingItems);

    // 3. Detect and resolve conflicts
    const { resolved, conflicts } = detectAndResolveConflicts(active, incoming);

    // 4. Compress
    const { compressed } = compressMemory(resolved);

    // 5. Build profile
    return buildMemoryProfile({ conversationId, organizationId, items: compressed, conflicts });
  },

  /** Retrieve contextually relevant items from a profile */
  retrieve(items: readonly MemoryItem[], query: RetrievalQuery): MemoryItem[] {
    return retrieveForContext(items, query);
  },

  /** Get items that need revalidation */
  getLowConfidence(items: readonly MemoryItem[], threshold = 50): MemoryItem[] {
    return findLowConfidence(items, threshold);
  },
};
