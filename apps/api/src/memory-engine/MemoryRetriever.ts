/**
 * memory-engine/MemoryRetriever.ts
 * Retrieves contextually relevant memories for a conversation objective. Pure.
 */
import type { MemoryItem, RetrievalQuery, RetrievalContext, ImportanceLevel } from './MemoryTypes';

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical: 4, high: 3, medium: 2, low: 1, negligible: 0,
};

// Fields relevant per context
const CONTEXT_FIELDS: Record<RetrievalContext, string[]> = {
  booking:           ['visitorName', 'phone', 'email', 'address', 'zip', 'service', 'preferredTime', 'emergency', 'bookingStatus'],
  emergency:         ['visitorName', 'phone', 'address', 'zip', 'service', 'emergency'],
  sales:             ['visitorName', 'company', 'industry', 'budget', 'timeline', 'decisionMaker', 'painPoints', 'goals', 'objections'],
  support:           ['visitorName', 'phone', 'email', 'service', 'objections', 'questionsAnswered'],
  qualification:     ['company', 'industry', 'employeeCount', 'budget', 'timeline', 'decisionMaker', 'painPoints', 'goals'],
  returning_visitor: ['visitorName', 'phone', 'email', 'service', 'bookingStatus', 'servicesDiscussed', 'preferredTime'],
  general:           ['visitorName', 'phone', 'service', 'painPoints', 'goals'],
};

export function retrieveForContext(
  items:  readonly MemoryItem[],
  query:  RetrievalQuery,
): MemoryItem[] {
  const relevant = CONTEXT_FIELDS[query.context] ?? [];
  const minRank  = query.minImportance ? IMPORTANCE_RANK[query.minImportance] : 0;
  const max      = query.maxItems ?? 20;

  return items
    .filter(i => relevant.includes(i.key) && IMPORTANCE_RANK[i.importance] >= minRank && i.value !== null && i.value !== undefined)
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, max);
}

export function findLowConfidence(items: readonly MemoryItem[], threshold = 50): MemoryItem[] {
  return items.filter(i => i.confidence < threshold || i.needsRevalidation);
}
