/**
 * conversation-engine/index.ts — Public API of Layer 3.
 * Import everything from here; never from sub-modules directly.
 */

// Core types
export type {
  ConversationObjective, WorkflowState, QuestionType, AllowedTool,
  RuleTrigger, RuleAction, BusinessRule,
  BlueprintStage, BlueprintTransition, BranchDefinition, RecoveryStrategy,
  ConversationBlueprint, OrchestrationInput, OrchestrationResult,
  ConversationPlan,
} from './types';

// Schemas
export {
  ConversationObjectiveSchema, WorkflowStateSchema,
  ConversationBlueprintSchema, BusinessRuleSchema,
} from './schemas';
export type { ConversationBlueprintInput } from './schemas';

// Primary entry point
export { ConversationOrchestrationService, setBlueprintRepository } from './ConversationOrchestrationService';

// Repository interface + default
export type { IBlueprintRepository }      from './repository/BlueprintRepository';
export { InMemoryBlueprintRepository }    from './repository/InMemoryBlueprintRepository';

// Cache
export { blueprintCache, BlueprintCache } from './cache/BlueprintCache';

// Default blueprints
export { DEFAULT_BLUEPRINTS }             from './blueprints/default-blueprints';

// Module functions (testing / advanced use)
export { loadBlueprint }                  from './modules/blueprint-loader';
export { evaluateRules }                  from './modules/rule-engine';
export { evaluateState }                  from './modules/state-evaluator';
export { selectObjective }                from './modules/objective-selector';
export { isObjectiveComplete }            from './modules/completion-evaluator';
export { detectRecoverySignal }           from './modules/recovery-manager';
export { buildConversationPlan }          from './modules/conversation-plan-builder';
