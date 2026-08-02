/**
 * intent-engine/index.ts
 *
 * Public API of the Intent Understanding Engine (Layer 2).
 * Import everything from here — never from sub-modules directly.
 */

// Core types
export type {
  IntentCategory,
  IntentSubCategory,
  ConfidenceLevel,
  UrgencyLevel,
  EntityType,
  ExtractedEntity,
  IntentCandidate,
  ResolvedIntent,
  BlueprintMapping,
  IntentKeywordRule,
  IntentAnalysisInput,
  IntentAnalysisResult,
} from './types';

// Schemas
export {
  IntentCategorySchema,
  BlueprintMappingSchema,
  IntentKeywordRuleSchema,
  IntentRegistryConfigSchema,
} from './schemas';
export type { IntentRegistryConfig } from './schemas';

// Primary entry point (the only thing the Conversation Engine calls)
export { IntentUnderstandingService, setIntentRepository } from './IntentUnderstandingService';

// Module helpers (for testing / advanced use)
export { classifyMessage }         from './modules/intent-classifier';
export { resolveIntent }           from './modules/ambiguity-resolver';
export { toConfidenceLevel, isCertain, requiresClarification, shouldEscalate } from './modules/confidence-evaluator';
export { analyzeUrgency, urgencySignals } from './modules/urgency-analyzer';
export { extractEntities }         from './modules/entity-extractor';
export { selectBlueprint }         from './modules/blueprint-selector';

// Factory
export { buildResolvedIntent }     from './IntentFactory';

// Repository interface + default implementation
export type { IIntentRepository }  from './repository/IntentRepository';
export { InMemoryIntentRepository } from './repository/InMemoryIntentRepository';

// Cache
export { intentRulesCache, IntentRulesCache } from './cache/IntentRulesCache';

// Default rules/mappings (for extension)
export { DEFAULT_KEYWORD_RULES, DEFAULT_BLUEPRINT_MAPPINGS } from './registry/default-rules';
