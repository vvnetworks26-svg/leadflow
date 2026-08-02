/**
 * State Evaluator — derives the current WorkflowState from inputs.
 * Pure function. Never mutates. No LLM dependency.
 */
import type {
  WorkflowState, ConversationBlueprint,
  ConversationObjective,
} from '../types';
import type { UrgencyLevel }          from '../../intent-engine/types';
import type { RichConversationMemory } from '../../ai/types';

export interface StateEvaluatorInput {
  memory:           RichConversationMemory;
  blueprint:        ConversationBlueprint | null;
  urgency:          UrgencyLevel;
  currentObjective: ConversationObjective | null;
  requiresHuman:    boolean;
  turnCount:        number;
}

export function evaluateState(input: StateEvaluatorInput): WorkflowState {
  const { memory, urgency, currentObjective, requiresHuman } = input;

  if (requiresHuman || currentObjective === 'escalate_to_human') return 'escalating';
  if (urgency === 'critical' || urgency === 'emergency')          return 'emergency_dispatch';
  if (currentObjective === 'complete_conversation')               return 'completed';
  if (currentObjective === 'confirm_appointment')                 return 'awaiting_confirmation';
  if (currentObjective === 'offer_appointment')                   return 'booking_in_progress';
  if (currentObjective === 'resolve_objection')                   return 'objection_handling';
  if (memory.bookingStatus === 'booked')                          return 'completed';

  if (!input.blueprint) return 'initialising';

  const collectObjectives: ConversationObjective[] = [
    'collect_name', 'collect_phone', 'collect_address', 'collect_email',
    'collect_budget', 'collect_timeline', 'collect_service_details',
    'collect_emergency_details',
  ];
  if (currentObjective && collectObjectives.includes(currentObjective)) {
    return 'collecting_info';
  }

  return 'initialising';
}
