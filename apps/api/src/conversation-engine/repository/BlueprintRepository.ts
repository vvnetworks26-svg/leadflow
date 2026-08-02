/**
 * conversation-engine/repository/BlueprintRepository.ts
 * Repository abstraction — swap MongoDB/JSON/API without touching the engine.
 */
import type { ConversationBlueprint } from '../types';

export interface IBlueprintRepository {
  findById(id: string): Promise<ConversationBlueprint | null>;
  findByIndustryAndIntent(industry: string, intentCategory: string): Promise<ConversationBlueprint | null>;
  listAll(): Promise<readonly ConversationBlueprint[]>;
}
