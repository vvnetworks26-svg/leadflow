/**
 * intent-engine/modules/blueprint-selector.ts
 *
 * Selects the appropriate Conversation Blueprint for a given industry + intent.
 * Config-driven — no hardcoded mappings in this file.
 *
 * Selection algorithm:
 *   1. Find all mappings where industry matches exactly OR industry === '*'
 *   2. Filter by intent category
 *   3. Sort by priority descending — higher priority wins
 *   4. Return the blueprintId of the top match, or null if none found
 */

import type { BlueprintMapping, IntentCategory } from '../types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select the blueprint ID for the given industry and intent.
 * Returns null when no mapping is configured (conversation continues with defaults).
 */
export function selectBlueprint(
  mappings: readonly BlueprintMapping[],
  industry: string,
  intent:   IntentCategory,
): string | null {
  const normalised = industry.toLowerCase();

  const matches = mappings
    .filter(m =>
      (m.industry === normalised || m.industry === '*') &&
      m.intent === intent
    )
    .sort((a, b) => {
      // Exact industry match beats wildcard
      const aExact = a.industry === normalised ? 1 : 0;
      const bExact = b.industry === normalised ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      // Then by explicit priority
      return b.priority - a.priority;
    });

  return matches[0]?.blueprintId ?? null;
}
