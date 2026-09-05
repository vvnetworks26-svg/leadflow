/**
 * ai/fallback-reply.ts
 *
 * The rule-based reply used whenever Gemini is unavailable or fails.
 *
 * PURE — no I/O, no side effects, no LLM. Extracted from ai/orchestrator.ts so
 * it can be unit-tested without pulling in the orchestrator's full import graph
 * (Gemini SDK, mongoose models, BullMQ queue, every engine layer).
 *
 * Keyed on the Layer 3 blueprint stage id (ConversationPlan.stageId), NOT the
 * legacy ConversationStage. The legacy stage stalls at 'discovery' for a
 * blueprint-driven flow — computeNextStage() only promotes to 'booking' on an
 * explicit booking-intent signal, which a plain factual answer never trips —
 * and the old switch had no 'discovery'/'qualification' case. So every turn past
 * the last legacy-planner question fell through to a generic FIRST-TURN greeting
 * ("Thanks for reaching out! How can I help you today?") mid-conversation,
 * discarding all context. Reproduced live twice against production.
 */

import type { OrgContext } from './prompt-builder';
import type {
  ConversationMemory,
  ConversationPlan as LegacyConversationPlan,
} from './types';

/**
 * Stage ids below are hvac.repair's
 * (conversation-engine/blueprints/default-blueprints.ts). hvac.booking reuses
 * greet/collect_service/collect_phone/offer_appointment/done, so it is covered
 * by the same cases. hvac.emergency's distinct ids (emergency_triage,
 * emergency_collect_address, emergency_book, emergency_done) intentionally fall
 * to the default below, which is now a safe mid-conversation handoff rather
 * than a greeting.
 */
export function buildFallbackReply(
  stageId: string | null,
  memory:  ConversationMemory,
  org:     OrgContext,
  plan?:   LegacyConversationPlan,
): string {
  // Priority 1: the legacy planner has a concrete question queued — use it.
  // This is the primary path when Gemini is unavailable, and covers the
  // collection stages for as long as the planner still has a field pending.
  if (plan?.questionToAsk) return plan.questionToAsk;

  // Priority 2: blueprint-stage fallbacks. Reached once the planner runs out of
  // questions — which is exactly where this flow used to break.
  const name    = memory.visitorName ? `, ${memory.visitorName}` : '';
  const company = org.name || 'our team';

  switch (stageId) {
    case 'greet':
      return org.welcomeMessage || `Hi! I'm the ${company} assistant. How can I help you today?`;

    case 'collect_service':
      return `Happy to help${name}. What's going on with your system — is it a repair, routine maintenance, or a replacement?`;

    case 'collect_emergency':
      return `Thanks${name}. Is this an emergency — like no heat or no A/C right now?`;

    case 'collect_phone':
      return `Got it${name}. What's the best number for our technician to reach you on?`;

    case 'collect_address':
      return `Thanks${name}. What's the service address we'd be coming out to?`;

    case 'offer_appointment':
      return `Great${name} — let's get you scheduled. What day works best for you?`;

    case 'confirm':
      return `Perfect${name} — I have everything I need to get this booked. Let me confirm those details and lock in your appointment.`;

    case 'done':
      // 'done' is normally only reachable once the blueprint's booking stage
      // has required booking_confirmed (memory.bookingStatus === 'booked') to
      // advance — see default-blueprints.ts. But this fallback path runs
      // whenever Gemini is unavailable and must not assume that invariant on
      // its own: claiming "confirmed" here regardless of bookingStatus is the
      // same false-confirmation bug this whole fix targets, just reached via
      // the rule-based path instead of a Gemini reply.
      return memory.bookingStatus === 'booked'
        ? `You're all set${name}! Your appointment is confirmed and ${company} will follow up shortly with the details. Anything else I can help with?`
        : `Thanks${name} — ${company} will follow up shortly to lock in your appointment time.`;

    default:
      // No blueprint stage resolved (identity/blueprint unavailable), or a stage
      // id from a blueprint without an explicit case above. Deliberately NOT a
      // first-turn greeting — this fires mid-conversation, where resetting the
      // visitor to "how can I help you today?" is exactly the reported bug.
      return `Thanks${name} — I have your details. ${company} will follow up shortly to confirm the next step.`;
  }
}
