/**
 * ai/conversation-state.ts
 *
 * Conversation state machine.
 * Stages: greeting → discovery → qualification → recommendation → objection
 *         → booking → completed / escalated
 *
 * Transitions are automatic based on intent, qualification score, and memory.
 */

import type { ConversationStage, DetectedIntent, QualificationScore, ConversationMemory } from './types';

// ─── Valid transitions ────────────────────────────────────────────────────────

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

// ─── Stage descriptions for prompt injection ──────────────────────────────────

export const STAGE_INSTRUCTIONS: Record<ConversationStage, string> = {
  greeting: `You are in the GREETING stage. Welcome the visitor warmly. Ask their name and what brings them here today. Keep it brief and inviting.`,

  discovery: `You are in the DISCOVERY stage. Your goal is to understand the visitor's situation. Ask open-ended questions about their business, current challenges, and what they're trying to achieve. One question at a time.`,

  qualification: `You are in the QUALIFICATION stage. Gather the remaining qualification signals: company size, budget range, timeline, and decision-making authority. Be conversational — not interrogative. Use information already collected (see memory).`,

  recommendation: `You are in the RECOMMENDATION stage. Based on what you've learned, present 1–2 relevant product recommendations with clear explanations of WHY each fits their situation. Be specific to their industry and pain points.`,

  objection: `You are in the OBJECTION HANDLING stage. The visitor has raised a concern. Address it using consultative selling — empathize, validate, then reframe the value. Never be pushy. Offer a low-commitment next step.`,

  booking: `You are in the BOOKING stage. The lead is ready for a strategy session. Enthusiastically confirm the next step and guide them to book a call. Ask for their preferred time and collect contact details if not yet gathered.`,

  completed: `You are in the COMPLETED stage. The booking or goal has been achieved. Thank the visitor, confirm next steps clearly, and close warmly.`,

  escalated: `You are in the ESCALATED stage. The conversation needs human attention. Apologize for any confusion, confirm their contact details, and assure them a team member will follow up promptly.`,
};

// ─── Transition logic ─────────────────────────────────────────────────────────

export function computeNextStage(
  current:      ConversationStage,
  intent:       DetectedIntent,
  score:        QualificationScore,
  memory:       ConversationMemory,
  turnCount:    number,
): ConversationStage {
  const allowed = TRANSITIONS[current];
  if (allowed.length === 0) return current;   // terminal state

  // Always escalate on explicit request
  if (/human|agent|person|representative|manager|speak to someone/i.test(memory.questionsAnswered.join(' '))) {
    if (allowed.includes('escalated')) return 'escalated';
  }

  // Booking intent → booking
  if (
    (intent.intent === 'Booking' || intent.intent === 'Demo' || memory.demoRequested || memory.bookingStatus === 'requested') &&
    allowed.includes('booking')
  ) return 'booking';

  // Booking confirmed → completed
  if (current === 'booking' && memory.bookingStatus === 'booked') return 'completed';

  // Objection detected → objection handling
  if (intent.intent === 'Objection' && memory.objections.length > 0 && allowed.includes('objection')) {
    return 'objection';
  }

  // Recommendation stage: score is sufficient or enough data collected
  if (
    current === 'qualification' &&
    (score.overall >= 50 || score.missingInfo.length <= 2) &&
    allowed.includes('recommendation')
  ) return 'recommendation';

  // Move from recommendation to booking if score crosses threshold
  if (current === 'recommendation' && score.overall >= 65 && allowed.includes('booking')) {
    return 'booking';
  }

  // Progress discovery → qualification after a few turns with some data
  if (
    current === 'discovery' &&
    turnCount >= 3 &&
    (memory.painPoints.length > 0 || memory.goals.length > 0) &&
    allowed.includes('qualification')
  ) return 'qualification';

  // Progress greeting → discovery after first message
  if (current === 'greeting' && turnCount >= 1 && allowed.includes('discovery')) {
    return 'discovery';
  }

  return current;   // stay in current stage
}

/**
 * Check if a transition between two stages is valid.
 */
export function isValidTransition(from: ConversationStage, to: ConversationStage): boolean {
  return TRANSITIONS[from].includes(to);
}
