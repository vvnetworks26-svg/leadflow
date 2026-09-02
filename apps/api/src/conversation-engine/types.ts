/**
 * conversation-engine/types.ts
 *
 * Domain types for the Conversation Orchestration Engine (Layer 3).
 * Single source of truth — every module imports from here.
 * No business logic — types only.
 */

import type { UrgencyLevel, ResolvedIntent } from '../intent-engine/types';
import type { BusinessIdentity }              from '../business-identity/types';
import type { RichConversationMemory, ConversationProgress } from '../ai/types';

// ─── Conversation Objectives ──────────────────────────────────────────────────

/**
 * The exhaustive set of business objectives the orchestrator may assign.
 * Exactly one is active at any moment.
 * New objectives are added here — no engine code changes needed.
 */
export type ConversationObjective =
  | 'build_rapport'
  | 'clarify_intent'
  | 'collect_name'
  | 'collect_phone'
  | 'collect_address'
  | 'collect_email'
  | 'collect_budget'
  | 'collect_timeline'
  | 'collect_service_details'
  | 'resolve_objection'
  | 'answer_question'
  | 'offer_recommendation'
  | 'offer_appointment'
  | 'confirm_appointment'
  | 'escalate_to_human'
  | 'complete_conversation'
  | 'handle_emergency'
  | 'handle_complaint'
  | 'handle_existing_appointment'
  | 'provide_estimate'
  | 'handle_billing'
  | 'handle_employment'
  | 'collect_emergency_details';

// ─── Workflow State ───────────────────────────────────────────────────────────

/** High-level state of the workflow — distinct from individual objectives */
export type WorkflowState =
  | 'initialising'
  | 'collecting_info'
  | 'awaiting_confirmation'
  | 'booking_in_progress'
  | 'objection_handling'
  | 'emergency_dispatch'
  | 'escalating'
  | 'completed'
  | 'recovery';

// ─── Rule types ───────────────────────────────────────────────────────────────

export type RuleTrigger =
  | 'urgency_critical'
  | 'urgency_emergency'
  | 'customer_wants_human'
  | 'business_closed'
  | 'intent_complaint'
  | 'intent_billing'
  | 'confidence_low'
  | 'repeated_failure'
  | 'booking_confirmed';

export type RuleAction =
  | 'escalate_immediately'
  | 'skip_to_booking'
  | 'skip_qualification'
  | 'offer_next_slot'
  | 'set_objective'
  | 'complete'
  | 'restart';

export interface BusinessRule {
  readonly id:       string;
  readonly trigger:  RuleTrigger;
  readonly action:   RuleAction;
  readonly targetObjective?: ConversationObjective;
  readonly priority: number;   // higher = evaluated first
  readonly enabled:  boolean;
}

// ─── Blueprint domain model ───────────────────────────────────────────────────

export type QuestionType =
  | 'open'
  | 'yes_no'
  | 'multiple_choice'
  | 'date_time'
  | 'phone'
  | 'address'
  | 'name'
  | 'free_text';

export type AllowedTool =
  | 'check_availability'
  | 'book_appointment'
  | 'lookup_faq'
  | 'get_estimate'
  | 'send_sms'
  | 'send_email'
  | 'create_lead'
  | 'escalate';

export interface BlueprintStage {
  readonly id:                 string;
  readonly objective:          ConversationObjective;
  readonly requiredFields:     readonly string[];
  readonly optionalFields:     readonly string[];
  readonly completionCriteria: readonly string[];   // field names that must be present
  readonly allowedTools:       readonly AllowedTool[];
  readonly transitions:        readonly BlueprintTransition[];
  readonly recoveryStrategy:   RecoveryStrategy;
  readonly skipWhen?:          readonly string[];   // progress keys — skip if true
  readonly exitConditions?:    readonly string[];
}

export interface BlueprintTransition {
  readonly condition:  string;    // e.g. "phone_collected", "booking_confirmed"
  readonly targetId:  string;    // id of next stage
  readonly priority:  number;
}

export interface BranchDefinition {
  readonly id:         string;
  readonly condition:  string;   // e.g. "urgency === 'critical'"
  readonly blueprintId:string;   // blueprint to load when condition is true
  readonly priority:   number;
}

export interface RecoveryStrategy {
  readonly onAmbiguity:    ConversationObjective;
  readonly onRepeat:       ConversationObjective;
  readonly onContradiction:ConversationObjective;
  readonly onTopicChange:  ConversationObjective;
  readonly preserveContext:boolean;
}

/** The immutable Blueprint aggregate */
export interface ConversationBlueprint {
  readonly id:              string;
  readonly name:            string;
  readonly industry:        string;          // 'hvac' | '*' wildcard
  readonly intentCategory:  string;
  readonly stages:          readonly BlueprintStage[];
  readonly defaultStageId:  string;
  readonly rules:           readonly BusinessRule[];
  readonly branches:        readonly BranchDefinition[];
  readonly metadata: {
    readonly version:    string;
    readonly createdAt:  string;
    readonly updatedAt:  string;
    readonly tags:       readonly string[];
  };
}

// ─── Orchestration I/O ────────────────────────────────────────────────────────

export interface OrchestrationInput {
  readonly organizationId:   string;
  readonly conversationId:   string;
  readonly identity:         BusinessIdentity;           // Layer 1
  readonly intent:           ResolvedIntent;             // Layer 2
  readonly memory:           RichConversationMemory;
  readonly progress:         ConversationProgress;
  readonly history:          readonly { role: 'user' | 'assistant'; content: string }[];
  readonly turnCount:        number;
  readonly currentObjective: ConversationObjective | null;
  readonly workflowState:    WorkflowState | null;
  readonly currentBlueprintId: string | null;
}

/** The structured output of the orchestration engine */
export interface ConversationPlan {
  readonly objective:           ConversationObjective;
  readonly reason:              string;                  // explainable decision log
  readonly requiredField:       string | null;
  readonly questionType:        QuestionType;
  readonly priority:            'critical' | 'high' | 'medium' | 'low';
  readonly allowedTools:        readonly AllowedTool[];
  readonly nextState:           WorkflowState;
  readonly fallbackState:       WorkflowState;
  readonly completionCriteria:  readonly string[];
  readonly recoveryStrategy:    RecoveryStrategy;
  readonly blueprintId:         string | null;
  /**
   * id of the blueprint stage this objective resolved to (e.g. 'offer_appointment',
   * 'confirm'), or null when no blueprint is loaded. buildConversationPlan() already
   * resolves this stage to derive allowedTools/completionCriteria — exposing its id
   * lets callers branch on the real blueprint stage instead of re-deriving it from
   * the objective, or falling back to the legacy ConversationStage machine.
   */
  readonly stageId:             string | null;
  readonly ruleApplied:         string | null;           // id of the rule that fired (if any)
  readonly isTerminal:          boolean;
}

export interface OrchestrationResult {
  readonly plan:               ConversationPlan;
  readonly updatedWorkflowState: WorkflowState;
  readonly updatedObjective:     ConversationObjective;
  readonly blueprintId:          string | null;
}
