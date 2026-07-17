/**
 * ai/conversation-state.ts  (v2.1 — Authoritative State Machine)
 *
 * This is the SINGLE source of truth for:
 *   1. Valid stage transitions
 *   2. Stage descriptions for Gemini
 *   3. Stage-level completion conditions
 *
 * No other module may make stage transition decisions.
 * The orchestrator calls computeNextStage() — nothing else does.
 *
 * Booking is detected here (once), not in the orchestrator.
 * Completion is detected here (once), not in the planner.
 */

import type {
  ConversationStage,
  DetectedIntent,
  QualificationScore,
  ConversationMemory,
} from './types';

// ─── Transition table ─────────────────────────────────────────────────────────

const TRANSITIONS: Record<ConversationStage, ConversationStage[]> = {
  greeting:       ['discovery', 'booking', 'escalated'],
  discovery:      ['qualification', 'recommendation', 'objection', 'booking', 'escalated'],
  qualification:  ['recommendation', 'objection', 'booking', 'escalated'],
  recommendation: ['objection', 'booking', 'completed', 'escalated'],
  objection:      ['recommendation', 'booking', 'completed', 'escalated'],
  booking:        ['completed', 'escalated'],
  completed:      [],
  escalated:      [],
};

// ─── Stage instructions (injected into Gemini prompt) ────────────────────────
//
// These describe HOW Gemini should behave in each stage.
// They do NOT contain any field-collection logic — that belongs to the planner.

export const STAGE_INSTRUCTIONS: Record<ConversationStage, string> = {
  greeting:
    `You are in the GREETING stage. Welcome the visitor warmly. Follow the conversation plan to collect the first required piece of information. Keep it brief and inviting.`,

  discovery:
    `You are in the DISCOVERY stage. Follow the conversation plan exactly — collect the next required field in a natural, conversational way. One question per message only.`,

  qualification:
    `You are in the QUALIFICATION stage. You have the core information. Now gather qualification signals (budget, timeline, decision authority) conversationally. Use the conversation plan.`,

  recommendation:
    `You are in the RECOMMENDATION stage. Present 1–2 relevant solutions with clear explanations of WHY each fits this visitor's specific situation. Be concrete and industry-specific.`,

  objection:
    `You are in the OBJECTION HANDLING stage. Empathize with the visitor's concern, validate it, then reframe the value. Never be pushy. Offer a low-commitment next step.`,

  booking:
    `You are in the BOOKING stage. The visitor is ready to schedule. Guide them to confirm the appointment. Be warm and efficient.`,

  completed:
    `You are in the COMPLETED stage. The goal has been achieved. Thank the visitor warmly, confirm next steps clearly, and close the conversation.`,

  escalated:
    `You are in the ESCALATED stage. A human needs to take over. Apologize for any confusion, confirm the visitor's contact details, and assure them someone will follow up promptly.`,
};

// ─── Escalation signals ───────────────────────────────────────────────────────

const ESCALATION_RE = /\b(human|agent|person|representative|manager|speak\s+to\s+someone|talk\s+to\s+a\s+person)\b/i;

function wantsEscalation(memory: ConversationMemory): boolean {
  return ESCALATION_RE.test(memory.questionsAnswered.join(' '));
}

// ─── Authoritative transition function ───────────────────────────────────────

/**
 * The ONLY function that may change conversation stage.
 *
 * Rules (evaluated in priority order):
 *   1. Terminal states never change
 *   2. Explicit escalation request → escalated
 *   3. Booking confirmed → completed
 *   4. Booking intent detected → booking
 *   5. Objection detected → objection handling
 *   6. Enough data for recommendation → recommendation
 *   7. Recommendation + high score → booking
 *   8. Discovery → qualification after 3 turns with pain/goals
 *   9. Greeting → discovery after first message
 *  10. Default: stay in current stage
 */
export function computeNextStage(
  current:   ConversationStage,
  intent:    DetectedIntent,
  score:     QualificationScore,
  memory:    ConversationMemory,
  turnCount: number,
): ConversationStage {
  const allowed = TRANSITIONS[current];

  // Rule 1: terminal states
  if (allowed.length === 0) return current;

  // Rule 2: explicit escalation
  if (wantsEscalation(memory) && allowed.includes('escalated')) {
    return 'escalated';
  }

  // Rule 3: booking confirmed → completed
  if (current === 'booking' && memory.bookingStatus === 'booked') {
    return 'completed';
  }

  // Rule 4: booking intent → booking
  // This is the ONLY place booking transition is decided.
  const bookingIntentSignals =
    intent.intent === 'Booking' ||
    intent.intent === 'Demo'    ||
    memory.demoRequested        ||
    memory.bookingStatus === 'requested';

  if (bookingIntentSignals && allowed.includes('booking')) {
    return 'booking';
  }

  // Rule 5: objection → objection handling
  if (
    intent.intent === 'Objection' &&
    memory.objections.length > 0 &&
    allowed.includes('objection')
  ) {
    return 'objection';
  }

  // Rule 6: qualification → recommendation when score is sufficient
  if (
    current === 'qualification' &&
    (score.overall >= 50 || score.missingInfo.length <= 2) &&
    allowed.includes('recommendation')
  ) {
    return 'recommendation';
  }

  // Rule 7: recommendation → booking when score crosses threshold
  if (
    current === 'recommendation' &&
    score.overall >= 65 &&
    allowed.includes('booking')
  ) {
    return 'booking';
  }

  // Rule 8: discovery → qualification after collecting some data
  if (
    current === 'discovery' &&
    turnCount >= 3 &&
    (memory.painPoints.length > 0 || memory.goals.length > 0) &&
    allowed.includes('qualification')
  ) {
    return 'qualification';
  }

  // Rule 9: greeting → discovery after first message
  if (current === 'greeting' && turnCount >= 1 && allowed.includes('discovery')) {
    return 'discovery';
  }

  // Rule 10: stay
  return current;
}

/**
 * Returns true if transitioning from `from` to `to` is valid.
 * Used only for validation/testing — not for driving transitions.
 */
export function isValidTransition(
  from: ConversationStage,
  to:   ConversationStage,
): boolean {
  return TRANSITIONS[from].includes(to);
}
