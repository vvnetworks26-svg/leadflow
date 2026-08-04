/**
 * validation-engine/FallbackResponseBuilder.ts
 *
 * Deterministic fallback responses for every validation failure scenario.
 *
 * Rules:
 *   - Never calls Gemini
 *   - Never generates prompts
 *   - Uses templated, business-safe text
 *   - Falls back to the current stage's most useful action
 *
 * PURE — no I/O.
 */

import type { ValidationContext } from './types';
import type { ConversationStage } from '../ai/types';

// ─── Field-specific follow-up questions ───────────────────────────────────────

const NEXT_FIELD_QUESTIONS: Record<string, string> = {
  phone:         "What's the best number to reach you on?",
  email:         "Could I get your email address?",
  address:       "What's the service address?",
  service:       "What service do you need help with today?",
  name:          "Could I get your name?",
  preferredTime: "When would be a good time for us to come out?",
};

function getNextMissingField(ctx: ValidationContext): string | null {
  const p = ctx.memory.progress;
  if (!p.visitorNameCollected)  return 'name';
  if (!p.serviceCollected)      return 'service';
  if (!p.phoneCollected && !p.emailCollected) return 'phone';
  if (!p.addressCollected)      return 'address';
  if (!p.appointmentCollected)  return 'preferredTime';
  return null;
}

// ─── Stage fallbacks ──────────────────────────────────────────────────────────

const STAGE_FALLBACKS: Record<ConversationStage, (ctx: ValidationContext) => string> = {
  greeting: ctx => {
    const biz = ctx.identity.receptionistIdentity;
    return biz.greetingTemplate || `Hi! I'm ${biz.aiName}, the virtual assistant for ${ctx.identity.companyProfile.businessName}. How can I help you today?`;
  },
  discovery: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return "What can I help you with today?";
  },
  qualification: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return "To get you the best help, could you tell me a bit more about the issue?";
  },
  recommendation: () =>
    "Based on what you've shared, let me connect you with the right service. One moment.",
  objection: () =>
    "That's completely understandable. Would it help to hear how we've helped customers in similar situations?",
  booking: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return "What day and time works best for you?";
  },
  completed: ctx => {
    const name = ctx.memory.visitorName ? `, ${ctx.memory.visitorName}` : '';
    return `You're all set${name}! We'll be in touch shortly. Is there anything else I can help with?`;
  },
  escalated: () =>
    "I want to make sure you get the right help. Could you share your contact information so our team can follow up directly?",
};

// ─── Validator-specific fallbacks ─────────────────────────────────────────────

const VALIDATOR_FALLBACKS: Record<string, (ctx: ValidationContext) => string> = {
  MemoryValidator: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return STAGE_FALLBACKS[ctx.stage]?.(ctx) ?? "How else can I help you?";
  },
  RepetitionValidator: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return "Thank you for your patience. Let me make sure I get this right — could you tell me a bit more?";
  },
  BlueprintValidator: ctx =>
    STAGE_FALLBACKS[ctx.stage]?.(ctx) ?? "Let me make sure I'm helping you with the right thing.",
  BookingValidator: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return "Before we set up your appointment, I just need a couple more details.";
  },
  HallucinationValidator: ctx =>
    `For accurate pricing and availability, I'd recommend speaking with our team directly. You can reach us at ${ctx.identity.contactInfo.phone || 'our main number'}.`,
  BusinessRuleValidator: ctx => {
    const biz = ctx.identity.companyProfile.businessName;
    return `Thanks for reaching out to ${biz}. Our team will be happy to assist — please leave your contact information and we'll get back to you.`;
  },
  UrgencyValidator: () =>
    "I'm sorry to hear that. Let's get someone out to help as quickly as possible. What's the best number to reach you on?",
  ToneValidator: ctx =>
    STAGE_FALLBACKS[ctx.stage]?.(ctx) ?? "How can I help you today?",
  ObjectiveValidator: ctx => {
    const field = getNextMissingField(ctx);
    if (field && NEXT_FIELD_QUESTIONS[field]) return NEXT_FIELD_QUESTIONS[field]!;
    return STAGE_FALLBACKS[ctx.stage]?.(ctx) ?? "What can I help you with?";
  },
};

// ─── Builder ──────────────────────────────────────────────────────────────────

export const FallbackResponseBuilder = {

  /**
   * Build a deterministic fallback response for a given validator failure.
   * Falls back to stage-level default if no specific fallback exists.
   */
  build(failedValidator: string, ctx: ValidationContext): string {
    const specific = VALIDATOR_FALLBACKS[failedValidator];
    if (specific) {
      const result = specific(ctx);
      if (result && result.trim().length > 0) return result;
    }
    // Final fallback: stage-level default
    return STAGE_FALLBACKS[ctx.stage]?.(ctx)
        ?? "How can I help you today?";
  },

  /**
   * Produce the next logical question for collecting missing information.
   * Used as a first-pass fallback in collection stages.
   */
  nextQuestion(ctx: ValidationContext): string | null {
    const field = getNextMissingField(ctx);
    return field ? (NEXT_FIELD_QUESTIONS[field] ?? null) : null;
  },
};
