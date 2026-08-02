/**
 * Blueprint Loader — resolves the correct blueprint for an industry + intent.
 * Pure async function; no side effects beyond cache writes.
 */
import type { IBlueprintRepository } from '../repository/BlueprintRepository';
import type { ConversationBlueprint } from '../types';
import { blueprintCache }             from '../cache/BlueprintCache';

export async function loadBlueprint(
  repo:            IBlueprintRepository,
  blueprintId:     string | null,
  industry:        string,
  intentCategory:  string,
): Promise<ConversationBlueprint | null> {

  // 1. Explicit ID lookup (highest priority)
  if (blueprintId) {
    const cached = blueprintCache.get(blueprintId);
    if (cached) return cached;
    const found = await repo.findById(blueprintId);
    if (found) { blueprintCache.set(blueprintId, found); return found; }
  }

  // 2. Industry + intent lookup
  const cacheKey = `${industry.toLowerCase()}::${intentCategory}`;
  const cachedByKey = blueprintCache.get(cacheKey);
  if (cachedByKey) return cachedByKey;

  const found = await repo.findByIndustryAndIntent(industry, intentCategory);
  if (found) {
    blueprintCache.set(found.id, found);
    blueprintCache.set(cacheKey, found);
  }
  return found;
}
