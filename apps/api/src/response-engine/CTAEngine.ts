/**
 * response-engine/CTAEngine.ts
 * Deterministic CTA selection. Pure function.
 */

import type { CTAType } from './types';
import type { UrgencyLevel } from '../intent-engine/types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';
import type { ConversationStage } from '../ai/types';

export function selectCTA(params: {
  objective:     ConversationObjective;
  stage:         ConversationStage;
  workflowState: WorkflowState;
  urgency:       UrgencyLevel;
  bookingStatus: 'none' | 'requested' | 'booked';
  requiresHuman: boolean;
}): CTAType {
  const { objective, stage, workflowState, urgency, bookingStatus, requiresHuman } = params;

  // Human escalation — highest priority
  if (requiresHuman || objective === 'escalate_to_human' || workflowState === 'escalating') {
    return 'TransferToHuman';
  }

  // Emergency → book immediately
  if (urgency === 'critical' || urgency === 'emergency' || workflowState === 'emergency_dispatch') {
    return 'BookAppointment';
  }

  // Booking confirmed → close
  if (bookingStatus === 'booked' || objective === 'complete_conversation') {
    return 'CloseConversation';
  }

  // Booking stage
  if (stage === 'booking' || objective === 'offer_appointment' || objective === 'confirm_appointment') {
    return 'BookAppointment';
  }

  // Completed
  if (stage === 'completed') return 'CloseConversation';

  // Recommendation
  if (stage === 'recommendation' || objective === 'offer_recommendation') {
    return 'RecommendService';
  }

  // Information collection → keep asking
  const collectionObjectives: ConversationObjective[] = [
    'collect_name', 'collect_phone', 'collect_address', 'collect_email',
    'collect_budget', 'collect_timeline', 'collect_service_details',
    'collect_emergency_details', 'clarify_intent', 'build_rapport',
  ];
  if (collectionObjectives.includes(objective)) return 'AskQuestion';

  // FAQ
  if (objective === 'answer_question') return 'ContinueConversation';

  // Discovery
  if (stage === 'discovery') return 'AskQuestion';

  return 'ContinueConversation';
}
