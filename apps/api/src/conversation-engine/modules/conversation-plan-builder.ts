/**
 * Conversation Plan Builder — assembles the final immutable ConversationPlan.
 * Pure function. Never calls LLM. Produces a structured business directive.
 */
import type {
  ConversationPlan, ConversationObjective, WorkflowState,
  QuestionType, AllowedTool, RecoveryStrategy,
  ConversationBlueprint,
} from '../types';

export interface PlanInput {
  objective:    ConversationObjective;
  workflowState:WorkflowState;
  blueprint:    ConversationBlueprint | null;
  ruleApplied:  string | null;
  reason:       string;
}

// ─── Objective → required field mapping ──────────────────────────────────────

const OBJECTIVE_FIELDS: Partial<Record<ConversationObjective, string>> = {
  collect_name:             'visitorName',
  collect_phone:            'phone',
  collect_address:          'address',
  collect_email:            'email',
  collect_budget:           'budget',
  collect_timeline:         'timeline',
  collect_service_details:  'service',
  collect_emergency_details:'emergency',
  offer_appointment:        'preferredTime',
};

const OBJECTIVE_QUESTION_TYPE: Partial<Record<ConversationObjective, QuestionType>> = {
  collect_name:             'name',
  collect_phone:            'phone',
  collect_address:          'address',
  collect_email:            'free_text',
  collect_budget:           'free_text',
  collect_timeline:         'date_time',
  collect_service_details:  'open',
  collect_emergency_details:'yes_no',
  offer_appointment:        'date_time',
  confirm_appointment:      'yes_no',
  clarify_intent:           'multiple_choice',
  resolve_objection:        'open',
  answer_question:          'open',
  build_rapport:            'open',
};

const OBJECTIVE_PRIORITY: Partial<Record<ConversationObjective, ConversationPlan['priority']>> = {
  handle_emergency:         'critical',
  collect_emergency_details:'critical',
  escalate_to_human:        'critical',
  handle_complaint:         'high',
  collect_phone:            'high',
  collect_name:             'high',
  collect_service_details:  'high',
  confirm_appointment:      'high',
  offer_appointment:        'high',
  collect_address:          'medium',
  collect_email:            'medium',
  collect_budget:           'medium',
  collect_timeline:         'medium',
};

const TERMINAL_OBJECTIVES: ConversationObjective[] = [
  'complete_conversation', 'escalate_to_human',
];

const DEFAULT_RECOVERY: RecoveryStrategy = {
  onAmbiguity:     'clarify_intent',
  onRepeat:        'clarify_intent',
  onContradiction: 'clarify_intent',
  onTopicChange:   'build_rapport',
  preserveContext: true,
};

const FALLBACK_STATE_MAP: Partial<Record<WorkflowState, WorkflowState>> = {
  emergency_dispatch:   'escalating',
  booking_in_progress:  'collecting_info',
  awaiting_confirmation:'booking_in_progress',
  objection_handling:   'collecting_info',
  escalating:           'completed',
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildConversationPlan(input: PlanInput): ConversationPlan {
  const { objective, workflowState, blueprint, ruleApplied, reason } = input;

  // Find the matching blueprint stage (if any)
  const stage = blueprint?.stages.find(s => s.objective === objective) ?? null;

  const requiredField   = OBJECTIVE_FIELDS[objective] ?? null;
  const questionType    = OBJECTIVE_QUESTION_TYPE[objective] ?? 'open';
  const priority        = OBJECTIVE_PRIORITY[objective] ?? 'medium';
  const allowedTools    = stage?.allowedTools ?? resolveDefaultTools(objective);
  const completionCriteria = stage?.completionCriteria ?? resolveDefaultCriteria(objective);
  const recoveryStrategy   = stage?.recoveryStrategy ?? DEFAULT_RECOVERY;
  const fallbackState      = FALLBACK_STATE_MAP[workflowState] ?? 'collecting_info';
  const isTerminal         = TERMINAL_OBJECTIVES.includes(objective) || workflowState === 'completed';

  return Object.freeze({
    objective,
    reason:             reason || `Pursuing objective: ${objective}`,
    requiredField,
    questionType,
    priority,
    allowedTools:       Object.freeze([...allowedTools]),
    nextState:          workflowState,
    fallbackState,
    completionCriteria: Object.freeze([...completionCriteria]),
    recoveryStrategy:   Object.freeze({ ...recoveryStrategy }),
    blueprintId:        blueprint?.id ?? null,
    stageId:            stage?.id ?? null,
    ruleApplied,
    isTerminal,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveDefaultTools(objective: ConversationObjective): AllowedTool[] {
  const map: Partial<Record<ConversationObjective, AllowedTool[]>> = {
    offer_appointment:    ['check_availability', 'book_appointment'],
    confirm_appointment:  ['book_appointment', 'send_sms'],
    answer_question:      ['lookup_faq'],
    provide_estimate:     ['get_estimate'],
    escalate_to_human:    ['escalate', 'send_sms'],
    collect_phone:        ['create_lead'],
    handle_emergency:     ['create_lead', 'book_appointment', 'send_sms'],
  };
  return map[objective] ?? [];
}

function resolveDefaultCriteria(objective: ConversationObjective): string[] {
  const map: Partial<Record<ConversationObjective, string[]>> = {
    collect_name:             ['visitorNameCollected'],
    collect_phone:            ['phoneCollected'],
    collect_address:          ['addressCollected'],
    collect_email:            ['emailCollected'],
    collect_budget:           ['budgetCollected'],
    collect_timeline:         ['timelineCollected'],
    collect_service_details:  ['serviceCollected'],
    collect_emergency_details:['emergencyCollected'],
    offer_appointment:        ['appointmentCollected'],
    confirm_appointment:      ['booking_confirmed'],
    build_rapport:            ['visitorNameCollected'],
  };
  return map[objective] ?? [];
}
