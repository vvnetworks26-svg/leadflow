/**
 * ai/conversation-planner.ts  (v2.1 — Pure Presenter)
 *
 * The planner is a PURE PRESENTER. Given the current state and memory,
 * it returns the next natural-language question to ask. Nothing more.
 *
 * What the planner does NOT do:
 *   - Decide stage transitions         → conversation-state.ts
 *   - Decide whether booking starts    → conversation-state.ts
 *   - Decide whether conversation ends → conversation-state.ts
 *   - Modify memory                    → memory.ts
 *   - Inspect rich memory for progression logic → only checks progress flags + rich values
 *
 * Hard rules (enforced here):
 *   1. Never returns a question for a field already marked collected in progress
 *   2. Never returns a question if the corresponding rich memory already has a value
 *   3. Returns the first uncollected required field in priority order
 *   4. Rotates question phrasing by turnCount so the bot doesn't repeat verbatim
 */

import type {
  ConversationProgress,
  ConversationPlan,
  ConversationStage,
  DetectedIntent,
  RichConversationMemory,
} from './types';
import { type IndustryKey, getProfile } from './industry-profiles';

// ─── Public input type ────────────────────────────────────────────────────────

export interface PlannerInput {
  memory:    RichConversationMemory;
  progress:  ConversationProgress;
  stage:     ConversationStage;
  industry:  IndustryKey;
  intent:    DetectedIntent;
  turnCount?: number;
}

// ─── Progress flag → rich memory field mapping ────────────────────────────────

/**
 * Maps each ConversationProgress key to the corresponding rich memory field.
 * Used to double-check that a field truly has no value before asking.
 */
const PROGRESS_TO_RICH_FIELD: Partial<
  Record<keyof ConversationProgress, keyof RichConversationMemory['rich']>
> = {
  visitorNameCollected: 'visitorName',
  companyCollected:     'company',
  phoneCollected:       'phone',
  emailCollected:       'email',
  addressCollected:     'address',
  budgetCollected:      'budget',
  timelineCollected:    'timeline',
  appointmentCollected: 'preferredTime',
  serviceCollected:     'service',
  emergencyCollected:   'emergency',
};

// ─── Planner ──────────────────────────────────────────────────────────────────

/**
 * Returns the next ConversationPlan — the natural language question Gemini
 * should ask, the goal it serves, and which progress field it targets.
 *
 * Returns a "complete" plan (empty questionToAsk) when:
 *   - Stage is booking, completed, or escalated (no collection needed)
 *   - All required fields for the industry are already collected
 */
export function planNextMove(input: PlannerInput): ConversationPlan {
  const { memory, progress, stage, industry, intent, turnCount = 0 } = input;
  const profile = getProfile(industry);

  // Non-collection stages: nothing to ask
  if (stage === 'booking' || stage === 'completed' || stage === 'escalated') {
    return completePlan();
  }

  for (const req of profile.requiredFields) {
    const { field, priority, goal, questions, condition } = req;

    // Hard rule 1: skip if progress flag is already set
    if (progress[field] === true) continue;

    // Hard rule 2: skip if rich memory already has a value for this field
    const richKey = PROGRESS_TO_RICH_FIELD[field];
    if (richKey) {
      const richVal = (memory.rich as Record<string, { value: unknown }>)[richKey];
      if (richVal?.value !== null && richVal?.value !== undefined) continue;
    }

    // Special case: painCollected maps to an array, not a single rich field
    if (field === 'painCollected' && memory.painPoints.length > 0) continue;

    // Condition guard (e.g. "only ask emergency if service is known")
    if (condition && !condition(memory)) continue;

    // If user is clearly booking/demo-intent, skip non-critical fields
    // This lets us fast-path to booking without interrogating them further.
    if (
      (intent.intent === 'Booking' || intent.intent === 'Demo') &&
      priority !== 'critical'
    ) {
      continue;
    }

    // Rotate question phrasing based on turn count
    const questionIndex = turnCount % questions.length;

    return {
      nextGoal:      goal,
      questionToAsk: questions[questionIndex],
      priority,
      fieldTargeted: field,
    };
  }

  // All required fields collected
  return completePlan();
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function completePlan(): ConversationPlan {
  return {
    nextGoal:      'complete',
    questionToAsk: '',
    priority:      'low',
    fieldTargeted: null,
  };
}
