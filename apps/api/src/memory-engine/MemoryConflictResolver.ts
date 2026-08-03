/**
 * memory-engine/MemoryConflictResolver.ts
 * Deterministic conflict resolution. Pure function.
 */
import type { MemoryItem, MemoryConflict, ConflictResolution, ConflictStrategy } from './MemoryTypes';

// Fields that always use the specified strategy
const FIELD_STRATEGY: Record<string, ConflictStrategy> = {
  bookingStatus: 'newest_wins',
  preferredTime: 'newest_wins',
  emergency:     'newest_wins',
  objections:    'merge',
  painPoints:    'merge',
  goals:         'merge',
  servicesDiscussed: 'merge',
  visitorName:   'highest_confidence_wins',
  phone:         'highest_confidence_wins',
  email:         'highest_confidence_wins',
  budget:        'highest_confidence_wins',
  timeline:      'highest_confidence_wins',
};

function pickStrategy(key: string, existing: MemoryItem, incoming: MemoryItem): ConflictStrategy {
  if (FIELD_STRATEGY[key]) return FIELD_STRATEGY[key];
  if (incoming.confidence < 40) return 'require_revalidation';
  if (Math.abs(existing.confidence - incoming.confidence) < 10) return 'mark_uncertain';
  return 'highest_confidence_wins';
}

function mergeArrayValues(a: unknown, b: unknown): unknown {
  const arrA = Array.isArray(a) ? a : [a].filter(Boolean);
  const arrB = Array.isArray(b) ? b : [b].filter(Boolean);
  return [...new Set([...arrA, ...arrB])];
}

export function resolveConflict(existing: MemoryItem, incoming: MemoryItem): ConflictResolution {
  const strategy = pickStrategy(existing.key, existing, incoming);
  const conflict: MemoryConflict = { key: existing.key, existing, incoming, strategy };

  switch (strategy) {
    case 'newest_wins':
      return { resolved: incoming, conflict, outcome: 'took_incoming' };

    case 'highest_confidence_wins':
      return incoming.confidence > existing.confidence
        ? { resolved: incoming, conflict, outcome: 'took_incoming' }
        : { resolved: existing, conflict, outcome: 'kept_existing' };

    case 'merge': {
      const merged = Object.freeze({
        ...existing,
        value: mergeArrayValues(existing.value, incoming.value),
        confidence: Math.max(existing.confidence, incoming.confidence),
      }) as MemoryItem;
      return { resolved: merged, conflict, outcome: 'merged' };
    }

    case 'mark_uncertain': {
      const uncertain = Object.freeze({
        ...existing,
        confidence: Math.round((existing.confidence + incoming.confidence) / 2),
        needsRevalidation: true,
      }) as MemoryItem;
      return { resolved: uncertain, conflict, outcome: 'marked_uncertain' };
    }

    case 'require_revalidation': {
      const flagged = Object.freeze({ ...existing, needsRevalidation: true }) as MemoryItem;
      return { resolved: flagged, conflict, outcome: 'kept_existing' };
    }

    default:
      return { resolved: existing, conflict, outcome: 'kept_existing' };
  }
}
