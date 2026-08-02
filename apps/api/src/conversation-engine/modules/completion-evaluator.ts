/**
 * Completion Evaluator — determines whether an objective is complete.
 * Pure function. No LLM required.
 */
import type { ConversationObjective }     from '../types';
import type { ConversationProgress, RichConversationMemory } from '../../ai/types';

export function isObjectiveComplete(
  objective: ConversationObjective,
  progress:  ConversationProgress,
  memory:    RichConversationMemory,
): boolean {
  switch (objective) {
    case 'collect_name':             return progress.visitorNameCollected;
    case 'collect_phone':            return progress.phoneCollected;
    case 'collect_address':          return progress.addressCollected;
    case 'collect_email':            return progress.emailCollected;
    case 'collect_budget':           return progress.budgetCollected;
    case 'collect_timeline':         return progress.timelineCollected;
    case 'collect_service_details':  return progress.serviceCollected;
    case 'collect_emergency_details':return progress.emergencyCollected;
    case 'confirm_appointment':      return memory.bookingStatus === 'booked';
    case 'complete_conversation':    return true;
    case 'escalate_to_human':        return true;
    // These require explicit advancement — not auto-completable from memory alone
    case 'build_rapport':            return progress.visitorNameCollected;
    case 'offer_appointment':        return progress.appointmentCollected;
    default:                         return false;
  }
}
