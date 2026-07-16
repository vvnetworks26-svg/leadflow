/**
 * ai/conversation-planner.ts
 *
 * Determines the MOST NATURAL next question to ask based on:
 *   - What information is already collected (ConversationProgress)
 *   - The industry profile's required fields (in priority order)
 *   - The current conversation stage
 *   - Any conditions on individual field requirements
 *
 * Hard rules:
 *   1. NEVER returns a question for a field already marked collected in progress
 *   2. NEVER returns a question if rich memory already has a value for that field
 *   3. Uses the first uncollected required field in priority order
 *   4. Rotates question phrasing so the bot doesn't always ask the same way
 */

import type {
  ConversationProgress,
  ConversationPlan,
  ConversationStage,
  DetectedIntent,
  RichConversationMemory,
} from './types';
import { type IndustryKey, getProfile } from './industry-profiles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlannerInput {
  memory:   RichConversationMemory;
  progress: ConversationProgress;
  stage:    ConversationStage;
  industry: IndustryKey;
  intent:   DetectedIntent;
  /** Turn count — used to rotate question phrasing */
  turnCount?: number;
}

// ─── Rich field → progress flag mapping ──────────────────────────────────────

/** Maps a ConversationProgress key back to the corresponding rich memory field */
const PROGRESS_TO_RICH_FIELD: Partial<Record<keyof ConversationProgress, keyof RichConversationMemory['rich']>> = {
  visitorNameCollected:  'visitorName',
  companyCollected:      'company',
  phoneCollected:        'phone',
  emailCollected:        'email',
  addressCollected:      'address',
  budgetCollected:       'budget',
  timelineCollected:     'timeline',
  appointmentCollected:  'preferredTime',
  serviceCollected:      'service',
  emergencyCollected:    'emergency',
};

// ─── Planner ──────────────────────────────────────────────────────────────────

/**
 * Determine the next conversation move.
 *
 * Returns a ConversationPlan describing what to ask next and why.
 * If all required fields are collected, returns a "complete" plan.
 */
export function planNextMove(input: PlannerInput): ConversationPlan {
  const { memory, progress, stage, industry, intent, turnCount = 0 } = input;
  const profile = getProfile(industry);

  // Booking / completion stages don't need field collection
  if (stage === 'booking' || stage === 'completed' || stage === 'escalated') {
    return completePlan();
  }

  for (const req of profile.requiredFields) {
    const { field, priority, goal, questions, condition } = req;

    // ── Hard rule 1: skip if progress flag is already set ─────────────────
    if (progress[field] === true) continue;

    // ── Hard rule 2: skip if rich memory already has a value ──────────────
    const richKey = PROGRESS_TO_RICH_FIELD[field];
    if (richKey) {
      const richValue = (memory.rich as any)[richKey];
      if (richValue && richValue.value !== null && richValue.value !== undefined) continue;
    }

    // ── Special case: painCollected maps to array ─────────────────────────
    if (field === 'painCollected' && memory.painPoints.length > 0) continue;

    // ── Condition guard ────────────────────────────────────────────────────
    if (condition && !condition(memory)) continue;

    // ── Intent override: if user explicitly wants to book, skip collection ─
    if (
      (intent.intent === 'Booking' || intent.intent === 'Demo') &&
      priority !== 'critical'
    ) {
      continue;
    }

    // ── Pick question phrasing (rotate based on turn count) ───────────────
    const questionIndex = turnCount % questions.length;
    const questionToAsk = questions[questionIndex];

    return {
      nextGoal:      goal,
      questionToAsk,
      priority,
      fieldTargeted: field,
    };
  }

  // All required fields for this industry are collected
  return completePlan();
}

function completePlan(): ConversationPlan {
  return {
    nextGoal:      'complete',
    questionToAsk: '',
    priority:      'low',
    fieldTargeted: null,
  };
}
