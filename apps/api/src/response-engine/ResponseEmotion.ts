/**
 * response-engine/ResponseEmotion.ts
 * Deterministic emotion selection. Pure function.
 */

import type { Emotion } from './types';
import type { UrgencyLevel } from '../intent-engine/types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';
import type { ConversationStage } from '../ai/types';

// ─── Priority rules (evaluated top-to-bottom, first match wins) ───────────────

export function selectEmotion(params: {
  urgency:       UrgencyLevel;
  objective:     ConversationObjective;
  stage:         ConversationStage;
  workflowState: WorkflowState;
  bookingStatus: 'none' | 'requested' | 'booked';
  hasObjection:  boolean;
}): Emotion {
  const { urgency, objective, stage, workflowState, bookingStatus, hasObjection } = params;

  // Critical urgency
  if (urgency === 'critical') return 'Concerned';

  // Booking complete → celebrate
  if (bookingStatus === 'booked' || objective === 'complete_conversation') return 'Celebratory';

  // Objection stage
  if (stage === 'objection' || hasObjection || objective === 'resolve_objection') return 'Supportive';

  // Escalation
  if (workflowState === 'escalating' || objective === 'escalate_to_human') return 'Apologetic';

  // Complaint
  if (objective === 'handle_complaint') return 'Apologetic';

  // Emergency (non-critical)
  if (urgency === 'emergency' || workflowState === 'emergency_dispatch') return 'Concerned';

  // Greeting / rapport building
  if (stage === 'greeting' || objective === 'build_rapport') return 'Neutral';

  // Recommendation
  if (stage === 'recommendation' || objective === 'offer_recommendation') return 'Encouraging';

  // Booking stage
  if (stage === 'booking' || objective === 'offer_appointment' || objective === 'confirm_appointment') {
    return 'Encouraging';
  }

  return 'Neutral';
}
