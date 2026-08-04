/**
 * handoff-engine/index.ts — Layer 9 public API
 */

export { HandoffEngine }           from './HandoffEngine';
export { HandoffCoordinator }      from './HandoffCoordinator';
export { EscalationDetector }      from './EscalationDetector';
export { ConfidenceEvaluator }     from './ConfidenceEvaluator';
export { HandoffPolicyEvaluator }  from './HandoffPolicy';
export { HandoffRules, DEFAULT_ROUTING_RULES } from './HandoffRules';
export { ConversationSummarizer }  from './ConversationSummarizer';
export { ContextBuilder }          from './ContextBuilder';
export { HumanHandoff }            from './HumanHandoff';
export { HandoffEventBuilder, HandoffEventBus } from './HandoffEventBuilder';

export type {
  EscalationReason,
  HandoffDestination,
  HandoffPriority,
  HandoffStatus,
  HandoffEventType,
  CollectedInfo,
  HandoffSummary,
  AgentContext,
  HandoffResult,
  HandoffEvent,
  EscalationInput,
  RoutingRule,
  HandoffPolicy,
} from './types';
