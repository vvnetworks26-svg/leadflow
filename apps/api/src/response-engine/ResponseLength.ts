/**
 * response-engine/ResponseLength.ts
 * Deterministic response length selection. Pure function.
 */

import type { ResponseLength } from './types';
import type { UrgencyLevel } from '../intent-engine/types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';
import type { ConversationStage } from '../ai/types';

export function selectLength(params: {
  urgency:       UrgencyLevel;
  objective:     ConversationObjective;
  stage:         ConversationStage;
  workflowState: WorkflowState;
  priority:      'critical' | 'high' | 'medium' | 'low';
}): ResponseLength {
  const { urgency, objective, stage, workflowState, priority } = params;

  // Emergency or critical → shortest possible
  if (urgency === 'critical' || workflowState === 'emergency_dispatch') return 'OneSentence';
  if (urgency === 'emergency') return 'Short';

  // Terminal states
  if (objective === 'complete_conversation') return 'Short';
  if (objective === 'escalate_to_human')     return 'Short';

  // Collection objectives → short (one question)
  const collectionObjectives: ConversationObjective[] = [
    'collect_name', 'collect_phone', 'collect_address', 'collect_email',
    'collect_budget', 'collect_timeline', 'collect_service_details',
    'collect_emergency_details',
  ];
  if (collectionObjectives.includes(objective)) return 'Short';

  // Confirmation
  if (objective === 'confirm_appointment' || objective === 'offer_appointment') return 'Short';

  // FAQ / question answering → can be longer
  if (objective === 'answer_question') return 'Medium';

  // Recommendation → medium (needs context)
  if (stage === 'recommendation' || objective === 'offer_recommendation') return 'Medium';
  if (objective === 'provide_estimate') return 'Medium';

  // Objection handling needs explanation
  if (objective === 'resolve_objection') return 'Medium';

  // Detailed only for explicit education
  if (priority === 'low' && stage === 'qualification') return 'Detailed';

  // Greeting / discovery → short natural opening
  if (stage === 'greeting' || objective === 'build_rapport') return 'Short';
  if (stage === 'discovery') return 'Short';

  return 'Short';
}
