/**
 * ai/orchestrator.ts
 *
 * Central AI orchestration layer.
 * All conversation logic lives here. Gemini is just the LLM transport.
 *
 * Per-turn flow:
 *   1. Guardrail input check
 *   2. Intent classification
 *   3. Memory update from user message
 *   4. Tool selection + execution
 *   5. Knowledge retrieval
 *   6. Qualification scoring
 *   7. Recommendation generation
 *   8. State machine transition
 *   9. Prompt assembly
 *  10. Gemini call
 *  11. Guardrail output check
 *  12. Memory update from AI reply
 *  13. Booking detection
 *  14. Analytics events
 *  15. Return OrchestratorOutput
 */

import type {
  OrchestratorInput,
  OrchestratorOutput,
  ConversationStage,
  AIAnalyticsEvent,
} from './types';
import { classifyIntent, hasBookingIntent }            from './intent';
import { updateMemoryFromMessage }                     from './memory';
import { qualifyLead, shouldTriggerBooking }           from './qualification';
import { generateRecommendations }                     from './recommendation';
import { computeNextStage, STAGE_INSTRUCTIONS }        from './conversation-state';
import { buildSystemPrompt, type OrgContext }          from './prompt-builder';
import { searchKnowledge }                             from './knowledge';
import { executeTool, selectAutoTools }                from './tools';
import { checkInput, checkOutput, fallbackResponse }   from './guardrails';
import { buildSummary }                                from './summarizer';
import { sendToGemini, isGeminiConfigured }            from './gemini';
import { makeEvent, persistEvents }                    from './analytics';
import { detectIndustry }                              from './industry-profiles';
import { planNextMove }                                from './conversation-planner';
import { OrganizationModel }                           from '../models/Organization.model';
import { BusinessModel }                               from '../models/Business.model';
import { logger }                                      from '../utils/logger';
import type { ConversationPlan, RichConversationMemory } from './types';

// ─── Org context loader ───────────────────────────────────────────────────────

async function loadOrgContext(organizationId: string): Promise<OrgContext> {
  const [org, biz] = await Promise.all([
    OrganizationModel.findById(organizationId).lean(),
    BusinessModel.findOne({ organizationId }).lean(),
  ]);

  const b = biz as any;
  const o = org as any;

  return {
    name:           b?.companyName ?? o?.name ?? 'Our Company',
    industry:       o?.industry   ?? b?.industry ?? 'General',
    timezone:       o?.timezone   ?? b?.timezone ?? 'UTC',
    companyEmail:   b?.email      ?? undefined,
    phone:          b?.phone      ?? undefined,
    services:       (b?.services ?? []).filter((s: any) => s.active).map((s: any) => s.name),
    aiTone:         b?.aiConfig?.tone ?? 'Friendly',
    welcomeMessage: b?.aiConfig?.welcomeMessage ?? 'Hi! How can I help you today?',
    enableEmergencyWorkflow: b?.aiConfig?.enableEmergencyWorkflow ?? true,
    faqEntries:     b?.aiConfig?.faq ?? [],
  };
}

// ─── Turn counter helper ──────────────────────────────────────────────────────

function countTurns(history: OrchestratorInput['history']): number {
  return history.filter(m => m.role === 'user').length;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { organizationId, conversationId, userMessage, history, memory, stage, currentPage } = input;
  const analyticsEvents: AIAnalyticsEvent[] = [];
  const toolsUsed: OrchestratorOutput['toolsUsed'] = [];

  // ── 1. Guardrail: input check ─────────────────────────────────────────────
  const inputGuard = checkInput(userMessage);
  if (!inputGuard.passed) {
    analyticsEvents.push(makeEvent('guardrail_blocked', organizationId, conversationId, {
      reason: inputGuard.reason, direction: 'input',
    }));
    persistEvents(analyticsEvents);

    return buildBlockedOutput(input, inputGuard.reason ?? '', analyticsEvents);
  }

  // ── 2. Intent classification ──────────────────────────────────────────────
  const intent = classifyIntent(userMessage);
  analyticsEvents.push(makeEvent('intent_classified', organizationId, conversationId, {
    intent: intent.intent, confidence: intent.confidence,
  }));

  // ── 3. Memory update from user message ────────────────────────────────────
  const lastAiMessage = [...history].reverse().find(m => m.role === 'assistant')?.content;
  const updatedMemory = updateMemoryFromMessage(memory, userMessage, lastAiMessage);
  const richMemory    = updatedMemory as RichConversationMemory;

  // Track booking intent in memory
  if (hasBookingIntent(userMessage, intent) && updatedMemory.bookingStatus === 'none') {
    updatedMemory.bookingStatus = 'requested';
  }
  if (intent.intent === 'Demo') {
    updatedMemory.demoRequested = true;
  }
  // ── 4. Tool selection + execution ────────────────────────────────────────
  const autoToolNames = selectAutoTools(userMessage, stage, intent.intent);
  for (const toolName of autoToolNames) {
    const result = await executeTool(toolName, { query: userMessage }, organizationId, updatedMemory);
    toolsUsed.push(result);
    analyticsEvents.push(makeEvent('tool_called', organizationId, conversationId, {
      tool: toolName, success: result.success,
    }));
  }

  // ── 5. Knowledge retrieval ────────────────────────────────────────────────
  const knowledgeHits = searchKnowledge(userMessage, undefined, 3);

  // ── 6. Qualification scoring ──────────────────────────────────────────────
  const qualification = qualifyLead(updatedMemory);
  analyticsEvents.push(makeEvent('lead_qualified', organizationId, conversationId, {
    score: qualification.overall, temperature: qualification.temperature,
  }));

  // ── 7. Recommendation generation ─────────────────────────────────────────
  const recommendations = generateRecommendations(updatedMemory, qualification, 3);
  if (recommendations.length > 0 && stage === 'recommendation') {
    analyticsEvents.push(makeEvent('recommendation_shown', organizationId, conversationId, {
      products: recommendations.map(r => r.product),
    }));
  }

  // ── 8. State machine transition ───────────────────────────────────────────
  const turnCount   = countTurns(history);
  const nextStage   = computeNextStage(stage, intent, qualification, updatedMemory, turnCount);
  if (nextStage !== stage) {
    analyticsEvents.push(makeEvent('stage_transition', organizationId, conversationId, {
      from: stage, to: nextStage,
    }));
  }

  // ── 9. Prompt assembly ────────────────────────────────────────────────────
  let orgContext: OrgContext;
  try {
    orgContext = await loadOrgContext(organizationId);
  } catch {
    orgContext = {
      name: 'Our Company', industry: 'General', timezone: 'UTC',
      services: [], aiTone: 'Friendly', welcomeMessage: 'Hi! How can I help?',
      enableEmergencyWorkflow: true, faqEntries: [],
    };
  }

  // ── 9a. Conversation planner ──────────────────────────────────────────────
  const industryKey = detectIndustry(orgContext.industry, richMemory);
  const plan        = planNextMove({
    memory:    richMemory,
    progress:  richMemory.progress,
    stage:     nextStage,
    industry:  industryKey,
    intent,
    turnCount,
  });

  const { system, knowledgeBlock } = buildSystemPrompt({
    org:             orgContext,
    stage:           nextStage,
    memory:          updatedMemory,
    score:           qualification,
    recommendations,
    knowledgeHits,
    currentPage,
    plan,
  });

  // ── 10. Gemini call ──────────────────────────────────────────────────────
  let reply: string;

  if (isGeminiConfigured()) {
    const geminiResp = await sendToGemini({
      systemPrompt:   system,
      knowledgeBlock,
      history,
      userMessage,
      maxTokens: 600,
    });

    if (geminiResp.success && geminiResp.text) {
      reply = geminiResp.text;
    } else {
      logger.warn({ error: geminiResp.error }, '[Orchestrator] Gemini failed, using fallback');
      reply = buildFallbackReply(nextStage, updatedMemory, orgContext, plan);
    }
  } else {
    // No API key — use rule-based fallback (dev/test mode)
    reply = buildFallbackReply(nextStage, updatedMemory, orgContext, plan);
  }

  // ── 11. Guardrail: output check ──────────────────────────────────────────
  const outputGuard = checkOutput(reply);
  reply = outputGuard.sanitized;
  if (!outputGuard.safe) {
    analyticsEvents.push(makeEvent('guardrail_blocked', organizationId, conversationId, {
      reason: outputGuard.reason, direction: 'output',
    }));
  }

  // ── 12. Memory: update from AI reply (track services mentioned) ──────────
  if (recommendations.length > 0) {
    const newServices = recommendations.map(r => r.title);
    updatedMemory.servicesDiscussed = [
      ...new Set([...updatedMemory.servicesDiscussed, ...newServices]),
    ];
  }

  // ── 13. Booking triggered signal ─────────────────────────────────────────
  // The state machine (step 8) is the single authority for booking transitions.
  // We derive bookingTriggered from what the state machine decided, not by
  // re-evaluating intent here. This eliminates the duplicate booking logic.
  const bookingTriggered = nextStage === 'booking' && stage !== 'booking';

  if (bookingTriggered) {
    if (updatedMemory.bookingStatus === 'none') {
      updatedMemory.bookingStatus = 'requested';
    }
    analyticsEvents.push(makeEvent('booking_triggered', organizationId, conversationId, {
      score: qualification.overall, temperature: qualification.temperature,
    }));
  }

  // ── 14. Summary (on completion / escalation) ─────────────────────────────
  let summaryText: string | undefined;
  if (nextStage === 'completed' || nextStage === 'escalated') {
    const summary = buildSummary(updatedMemory, qualification, recommendations);
    summaryText = summary.fullSummary;
    updatedMemory.summary = summaryText;
    analyticsEvents.push(makeEvent('conversation_summarized', organizationId, conversationId, {
      temperature: qualification.temperature, bookingStatus: updatedMemory.bookingStatus,
    }));
  }

  // ── 15. Message received event ────────────────────────────────────────────
  analyticsEvents.push(makeEvent('message_received', organizationId, conversationId, {
    turnCount: turnCount + 1, stage: nextStage,
  }));

  // Fire-and-forget persist
  persistEvents(analyticsEvents);

  return {
    reply,
    updatedMemory,
    updatedStage:    nextStage,
    intent,
    qualification,
    recommendations,
    toolsUsed,
    bookingTriggered,
    summary:         summaryText,
    analyticsEvents,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBlockedOutput(
  input:           OrchestratorInput,
  reason:          string,
  analyticsEvents: AIAnalyticsEvent[],
): OrchestratorOutput {
  return {
    reply:           fallbackResponse(reason),
    updatedMemory:   input.memory,
    updatedStage:    input.stage,
    intent:          { intent: 'Unknown', confidence: 0, subIntents: [], rawText: input.userMessage },
    qualification:   qualifyLead(input.memory),
    recommendations: [],
    toolsUsed:       [],
    bookingTriggered:false,
    analyticsEvents,
  };
}
function buildFallbackReply(
  stage:  ConversationStage,
  memory: OrchestratorInput['memory'],
  org:    OrgContext,
  plan?:  ConversationPlan,
): string {
  // Priority 1: planner has a concrete question — use it directly.
  // This is the primary path when Gemini is unavailable.
  if (plan?.questionToAsk) return plan.questionToAsk;

  // Priority 2: stage-level fallbacks for non-collection stages.
  // These are the only cases where the planner returns an empty question.
  const name = memory.visitorName ? `, ${memory.visitorName}` : '';

  switch (stage) {
    case 'greeting':
      return org.welcomeMessage || `Hi! I'm the ${org.name} assistant. How can I help you today?`;
    case 'recommendation':
      return `Based on what you've shared, I think our ${org.services[0] ?? 'solution'} would be a great fit. Want me to tell you more?`;
    case 'objection':
      return `That's a completely understandable concern${name}. Many of our clients felt the same way initially — would it help to hear how they got results?`;
    case 'booking':
      return `Absolutely${name}. What day and time works best for you?`;
    case 'completed':
      return `You're all set${name}! We'll be in touch shortly. Is there anything else I can help with?`;
    case 'escalated':
      return `I want to make sure you get the right help${name}. Could you share your email or phone number so our team can follow up directly?`;
    default:
      // Generic discovery/qualification fallback — planner should have caught this,
      // but we need a safe final backstop.
      return `Thanks for reaching out! How can I help you today?`;
  }
}
