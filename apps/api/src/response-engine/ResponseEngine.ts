/**
 * response-engine/ResponseEngine.ts
 *
 * Layer 4 — Response Engine.
 * Receives conversation state and produces a structured ResponseBlueprint.
 *
 * NEVER calls Gemini.
 * NEVER accesses MongoDB.
 * NEVER performs side effects.
 * Every function is pure.
 *
 * The ResponseBlueprint is later consumed by Gemini (or any LLM) which decides
 * how to word the response according to the instructions provided.
 *
 * Integration point: replace buildFallbackReply() in ai/orchestrator.ts with
 * ResponseEngine.buildBlueprint() to adopt Layer 4 without any other changes.
 */

import type { ResponseBlueprint, ResponseEngineInput } from './types';
import { selectTone }            from './ResponseTone';
import { selectEmotion }         from './ResponseEmotion';
import { selectLength }          from './ResponseLength';
import { selectCTA }             from './CTAEngine';
import { buildPersonalization }  from './Personalization';
import { selectStyle, buildGuardrails, buildExamples } from './ResponsePlanner';
import { buildResponseBlueprint }from './ResponseBlueprint';
import {
  humanizeFieldQuestion,
  buildMustMention,
  buildMustAvoid,
} from './Humanizer';

// ─── Public API ───────────────────────────────────────────────────────────────

export const ResponseEngine = {

  /**
   * Primary entry point.
   * Processes the pipeline and returns a frozen ResponseBlueprint.
   * Pure — no side effects, no async, no I/O.
   */
  buildBlueprint(input: ResponseEngineInput): ResponseBlueprint {
    const { plan, identity, stage, memory, intent, qualification, recommendations, workflowState } = input;

    const industry  = identity.companyProfile.industry;
    const brandTone = identity.brandPersonality.tone;
    const objective = plan.objective;

    // ── 1. Tone ───────────────────────────────────────────────────────────
    const tone = selectTone({
      urgency:       intent.urgency,
      objective,
      brandTone,
      industry,
      workflowState,
    });

    // ── 2. Emotion ────────────────────────────────────────────────────────
    const emotion = selectEmotion({
      urgency:       intent.urgency,
      objective,
      stage,
      workflowState,
      bookingStatus: memory.bookingStatus,
      hasObjection:  memory.objections.length > 0,
    });

    // ── 3. Length ─────────────────────────────────────────────────────────
    const length = selectLength({
      urgency:       intent.urgency,
      objective,
      stage,
      workflowState,
      priority:      plan.priority,
    });

    // ── 4. CTA ────────────────────────────────────────────────────────────
    const cta = selectCTA({
      objective,
      stage,
      workflowState,
      urgency:       intent.urgency,
      bookingStatus: memory.bookingStatus,
      requiresHuman: intent.requiresHuman,
    });

    // ── 5. Personalization ────────────────────────────────────────────────
    const personalization = buildPersonalization(memory);

    // ── 6. Question ───────────────────────────────────────────────────────
    // Use the humanized version of the plan's question field, or derive from
    // the required field when the plan doesn't provide a specific question.
    const rawQuestion = (plan as any).questionToAsk ?? '';
    const question = rawQuestion.length > 0
      ? rawQuestion
      : plan.requiredField
        ? humanizeFieldQuestion(plan.requiredField, 0)
        : undefined;

    // ── 7. Style ──────────────────────────────────────────────────────────
    const style = selectStyle({ objective, stage, industry });

    // ── 8. mustMention / mustAvoid ────────────────────────────────────────
    const mustMention = buildMustMention({
      objective:    objective as string,
      visitorName:  personalization.visitorName,
      service:      personalization.service ?? intent.detectedService ?? undefined,
      businessName: identity.companyProfile.businessName,
      isEmergency:  intent.urgency === 'critical' || intent.urgency === 'emergency',
      bookingStatus:memory.bookingStatus,
    });

    const mustAvoid = buildMustAvoid({
      objective: objective as string,
      industry:  industry as string,
    });

    // ── 9. Guardrails ─────────────────────────────────────────────────────
    const neverAskCompanyName = identity.conversationRules.enabled
      .includes('never_ask_company_name');

    const guardrails = buildGuardrails({
      objective,
      stage,
      hasRules: identity.conversationRules.enabled.length > 0,
      neverAskCompanyName,
    });

    // ── 10. Examples ──────────────────────────────────────────────────────
    const examples = buildExamples({
      objective,
      visitorName:  personalization.visitorName,
      service:      personalization.service,
      bookingStatus:memory.bookingStatus,
    });

    // ── 11. Assemble ──────────────────────────────────────────────────────
    return buildResponseBlueprint({
      objective,
      tone,
      emotion,
      urgency:      intent.urgency,
      cta,
      question,
      personalization,
      length,
      style,
      mustMention,
      mustAvoid,
      guardrails,
      examples,
      industry,
      stage,
      workflowState,
    });
  },
};
