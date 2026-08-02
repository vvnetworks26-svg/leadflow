/**
 * conversation-engine/repository/InMemoryBlueprintRepository.ts
 * Default in-memory repository seeded from default-blueprints.
 * Replace with MongoDBlueprintRepository for dynamic per-tenant blueprints.
 */
import type { IBlueprintRepository } from './BlueprintRepository';
import type { ConversationBlueprint } from '../types';
import { ConversationBlueprintSchema } from '../schemas';
import { DEFAULT_BLUEPRINTS }          from '../blueprints/default-blueprints';

export class InMemoryBlueprintRepository implements IBlueprintRepository {
  private readonly blueprints: Map<string, ConversationBlueprint>;

  constructor(custom?: ConversationBlueprint[]) {
    const all = [...DEFAULT_BLUEPRINTS, ...(custom ?? [])];
    // Validate every blueprint at construction — fail fast
    const validated = all.map(bp => ConversationBlueprintSchema.parse(bp) as ConversationBlueprint);
    this.blueprints = new Map(validated.map(bp => [bp.id, bp]));
  }

  async findById(id: string): Promise<ConversationBlueprint | null> {
    return this.blueprints.get(id) ?? null;
  }

  async findByIndustryAndIntent(
    industry: string,
    intentCategory: string,
  ): Promise<ConversationBlueprint | null> {
    const norm = industry.toLowerCase();

    // 1. Exact industry + exact intent
    for (const bp of this.blueprints.values()) {
      if (bp.industry === norm && bp.intentCategory === intentCategory) return bp;
    }
    // 2. Wildcard industry + exact intent
    for (const bp of this.blueprints.values()) {
      if (bp.industry === '*' && bp.intentCategory === intentCategory) return bp;
    }
    return null;
  }

  async listAll(): Promise<readonly ConversationBlueprint[]> {
    return [...this.blueprints.values()];
  }
}
