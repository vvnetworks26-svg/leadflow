/**
 * intent-engine/repository/InMemoryIntentRepository.ts
 *
 * Default in-memory repository seeded from the static default-rules registry.
 * Works out of the box with no DB required.
 * Replace with MongoIntentRepository for dynamic per-tenant rules.
 */

import type { IIntentRepository }                      from './IntentRepository';
import type { IntentKeywordRule, BlueprintMapping }    from '../types';
import { DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS } from '../registry/default-rules';
import { IntentRegistryConfigSchema }                  from '../schemas';

export class InMemoryIntentRepository implements IIntentRepository {
  private readonly rules:    readonly IntentKeywordRule[];
  private readonly mappings: readonly BlueprintMapping[];

  constructor(overrides?: { rules?: IntentKeywordRule[]; mappings?: BlueprintMapping[] }) {
    // Validate any overrides at construction time — fail fast on bad config
    const validated = IntentRegistryConfigSchema.parse({
      rules:    overrides?.rules    ?? [...DEFAULT_KEYWORD_RULES],
      mappings: overrides?.mappings ?? [...DEFAULT_BLUEPRINT_MAPPINGS],
    });
    this.rules    = Object.freeze(validated.rules);
    this.mappings = Object.freeze(validated.mappings);
  }

  async getRules(): Promise<readonly IntentKeywordRule[]> {
    return this.rules;
  }

  async getMappings(): Promise<readonly BlueprintMapping[]> {
    return this.mappings;
  }

  async findByCategory(category: string): Promise<IntentKeywordRule | undefined> {
    return this.rules.find(r => r.intent === category);
  }
}
