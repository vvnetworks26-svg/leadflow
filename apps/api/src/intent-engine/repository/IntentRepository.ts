/**
 * intent-engine/repository/IntentRepository.ts
 *
 * Repository interface for loading intent rules and blueprint mappings.
 * Swap the implementation (InMemoryIntentRepository, MongoIntentRepository, etc.)
 * without changing any engine code.
 */

import type { IntentKeywordRule, BlueprintMapping } from '../types';

export interface IIntentRepository {
  /** All keyword rules used by the classifier */
  getRules(): Promise<readonly IntentKeywordRule[]>;
  /** All blueprint mappings */
  getMappings(): Promise<readonly BlueprintMapping[]>;
  /** Find a rule by intent category */
  findByCategory(category: string): Promise<IntentKeywordRule | undefined>;
}
