/**
 * Objective Selector — determines the single next ConversationObjective.
 * Reads the current blueprint stage sequence and progress flags.
 * Skips stages whose skip conditions are satisfied. Pure function.
 */
import type {
  ConversationObjective, WorkflowState,
  ConversationBlueprint, BlueprintStage,
} from '../types';
import type { ConversationProgress } from '../../ai/types';
import type { IntentCategory }       from '../../intent-engine/types';

export interface ObjectiveSelectorInput {
  blueprint:        ConversationBlueprint;
  progress:         ConversationProgress;
  workflowState:    WorkflowState;
  intentCategory:   IntentCategory;
  currentObjective: ConversationObjective | null;
  bookingConfirmed: boolean;
}

export function selectObjective(input: ObjectiveSelectorInput): ConversationObjective {
  const { blueprint, progress, workflowState, bookingConfirmed, currentObjective } = input;

  // Terminal states
  if (workflowState === 'completed')  return 'complete_conversation';
  if (workflowState === 'escalating') return 'escalate_to_human';

  // Walk stages in order, return first whose completion criteria are NOT met
  // and whose skip conditions are not all satisfied
  for (const stage of blueprint.stages) {
    if (isSkipped(stage, progress)) continue;
    if (isComplete(stage, progress, bookingConfirmed)) continue;
    return stage.objective;
  }

  return 'complete_conversation';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSkipped(stage: BlueprintStage, progress: ConversationProgress): boolean {
  if (!stage.skipWhen || stage.skipWhen.length === 0) return false;
  return stage.skipWhen.every(key => (progress as any)[key] === true);
}

function isComplete(
  stage:            BlueprintStage,
  progress:         ConversationProgress,
  bookingConfirmed: boolean,
): boolean {
  if (stage.completionCriteria.length === 0) return false;

  return stage.completionCriteria.every(criterion => {
    if (criterion === 'booking_confirmed') return bookingConfirmed;
    if (criterion === 'answered')          return true;   // FAQ stages auto-complete
    if (criterion === 'estimate_sent')     return true;   // estimate stages auto-complete
    return (progress as any)[criterion] === true;
  });
}
