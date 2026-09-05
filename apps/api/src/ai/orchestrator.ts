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
  DetectedIntent,
} from './types';
import { classifyIntent, hasBookingIntent }            from './intent';
import { updateMemoryFromMessage }                     from './memory';
import { qualifyLead, shouldTriggerBooking }           from './qualification';
import { generateRecommendations }                     from './recommendation';
import { computeNextStage, STAGE_INSTRUCTIONS }        from './conversation-state';
import { buildSystemPrompt, type OrgContext }          from './prompt-builder';
import { buildFallbackReply }                          from './fallback-reply';
import { searchKnowledge }                             from './knowledge';
import { executeTool, selectAutoTools }                from './tools';
import { checkInput, checkOutput, fallbackResponse }   from './guardrails';
import { sendToGemini, isGeminiConfigured }            from './gemini';
import { enqueueConversationSummary }                  from './pipeline/ConversationSummaryQueue';
import { makeEvent, persistEvents }                    from './analytics';
import { detectIndustry }                              from './industry-profiles';
import { planNextMove }                                from './conversation-planner';
import { OrganizationModel }                           from '../models/Organization.model';
import { BusinessModel }                               from '../models/Business.model';
import { BusinessIdentityService }                     from '../business-identity/BusinessIdentityService';
import { ResponseEngine }                              from '../response-engine/ResponseEngine';
import { PromptAssembler }                             from '../prompt-assembly/PromptAssembler';
import { ConversationOrchestrationService }            from '../conversation-engine/ConversationOrchestrationService';
import { logger }                                      from '../utils/logger';
import type { ConversationPlan as LegacyConversationPlan, RichConversationMemory } from './types';
import type {
  ConversationPlan as L3ConversationPlan,
  ConversationObjective,
  WorkflowState,
} from '../conversation-engine/types';
import type { ResolvedIntent } from '../intent-engine/types';

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

  // ── 9a. Conversation planner ───────────────────────────────────────────────
  // Retained only as the source of a ready-to-use fallback question string for
  // buildFallbackReply() below (used when Gemini is unavailable/fails). Actual
  // objective/stage progression comes from the Layer 3 engine in 9b2.
  const industryKey = detectIndustry(orgContext.industry, richMemory);
  const plan        = planNextMove({
    memory:    richMemory,
    progress:  richMemory.progress,
    stage:     nextStage,
    industry:  industryKey,
    intent,
    turnCount,
  });

  // ── 9b. Layer 1: Business Identity (async load, cached) ───────────────────
  const identity = await BusinessIdentityService.load(organizationId);

  // ── 9b2. Layer 2/3: resolve intent, run the real orchestration engine ─────
  // NOTE: confidenceLevel/urgency/requiresHuman are placeholders here — this
  // repo's Layer 2 (intent-engine/IntentUnderstandingService) is not wired
  // into the live path yet, so urgency-based Layer 3 rules (e.g. emergency
  // escalation) won't fire from real signal until that's connected too.
  const resolvedIntent = buildResolvedIntent(intent, userMessage, conversationId, turnCount);

  let l3Plan:              L3ConversationPlan | null = null;
  let updatedObjective:    string | null = input.currentObjective   ?? null;
  let updatedWorkflowState:string | null = input.workflowState      ?? null;
  let updatedBlueprintId:  string | null = input.currentBlueprintId ?? null;

  if (identity) {
    const orchestration = await ConversationOrchestrationService.orchestrate({
      organizationId,
      conversationId,
      identity,
      intent:             resolvedIntent,
      memory:             richMemory,
      progress:           richMemory.progress,
      history,
      turnCount,
      currentObjective:   (input.currentObjective as ConversationObjective | null | undefined) ?? null,
      workflowState:      (input.workflowState as WorkflowState | null | undefined) ?? null,
      currentBlueprintId: input.currentBlueprintId ?? null,
    });
    l3Plan               = orchestration.plan;
    updatedObjective     = orchestration.updatedObjective;
    updatedWorkflowState = orchestration.updatedWorkflowState;
    updatedBlueprintId   = orchestration.blueprintId;
  }

  // ── 9c. Layer 4: Response Engine → ResponseBlueprint ────────────────────
  const blueprint = identity && l3Plan
    ? ResponseEngine.buildBlueprint({
        plan:            l3Plan,
        identity,
        stage:           nextStage,
        memory:          richMemory,
        intent:          resolvedIntent,
        qualification,
        recommendations,
        workflowState:   nextStage === 'booking' ? 'booking_in_progress'
                       : nextStage === 'completed' ? 'completed'
                       : nextStage === 'escalated' ? 'escalating'
                       : 'collecting_info',
      })
    : null;

  // ── 9d. Layer 5: Prompt Assembler → RendererPrompt ───────────────────────
  let system: string;
  let knowledgeBlock: string;

  if (identity && blueprint && l3Plan) {
    const rendererPrompt = PromptAssembler.build({
      identity,
      plan:            l3Plan,
      blueprint,
      memory:          richMemory,
      qualification,
      intent:          resolvedIntent,
      knowledgeHits,
      recommendations,
      history,
      currentPage,
      stage:           nextStage,
    });
    system         = rendererPrompt.systemPrompt;
    knowledgeBlock = rendererPrompt.knowledgeBlock;
  } else {
    // Fallback to legacy prompt builder when identity not available
    const legacy = buildSystemPrompt({
      org:             orgContext,
      stage:           nextStage,
      memory:          updatedMemory,
      score:           qualification,
      recommendations,
      knowledgeHits,
      currentPage,
      plan,
    });
    system         = legacy.system;
    knowledgeBlock = legacy.knowledgeBlock;
  }

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
      reply = buildFallbackReply(l3Plan?.stageId ?? null, updatedMemory, orgContext, plan);
    }
  } else {
    // No API key — use rule-based fallback (dev/test mode)
    reply = buildFallbackReply(l3Plan?.stageId ?? null, updatedMemory, orgContext, plan);
  }

  // ── 11. Guardrail: output check ──────────────────────────────────────────
  const outputGuard = checkOutput(reply, updatedMemory.bookingStatus);
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
  // Layer 3 (ConversationOrchestrationService) is the single authority for
  // booking transitions — NOT the legacy ConversationStage machine.
  //
  // This previously read `nextStage === 'booking' && stage !== 'booking'`, which
  // never fired in a blueprint-driven flow: computeNextStage() only promotes to
  // 'booking' on an explicit booking-intent signal (Rule 4, ai/conversation-state.ts),
  // and a plain factual answer ("Monday") never trips that. The legacy stage stalled
  // at 'discovery' for the whole conversation, so bookingTriggered stayed false and
  // the widget's SlotPicker — whose only entry point is this flag — never rendered,
  // even though the booking endpoint's own Layer 3 stage gate was already open.
  //
  // Edge-triggering reuses a primitive that already exists rather than adding new
  // tracking state: input.currentObjective is the objective persisted from the
  // PREVIOUS turn (widgetController reads it in, then writes updatedObjective back
  // after every turn), so comparing it against this turn's objective identifies the
  // transition moment exactly once. While the objective holds at 'offer_appointment'
  // on later turns, previous === current and this correctly stays false.
  //
  // Keyed on the objective rather than the stage id because the appointment-offering
  // stage is named differently per blueprint ('offer_appointment' in hvac.repair /
  // hvac.booking, 'emergency_book' in hvac.emergency) while all of them share the
  // 'offer_appointment' objective — see conversation-engine/blueprints/default-blueprints.ts.
  //
  // Also fires on entry into 'confirm_appointment', not just 'offer_appointment'.
  // objective-selector.ts's selectObjective() walks the blueprint's stage list in
  // one pass and can skip straight past 'offer_appointment' into 'confirm' within a
  // SINGLE turn whenever a free-text message supplies enough info to satisfy both
  // stages' completion criteria at once (e.g. address + a stated time together) —
  // in that case 'offer_appointment' is never the *recorded* updatedObjective on any
  // turn, so the old single-objective check would never fire and the SlotPicker
  // would never render, even though the model is now at the objective whose prompt
  // guidance talks about finalizing a booking. Confirmed reproducible against the
  // real Layer 3 engine (see fallback-blueprint-flow.test.ts's multi-hop case).
  //
  // This is deliberately just the render trigger, not a confirmation of anything —
  // it only tells the frontend "open the real SlotPicker flow now". Whether the
  // booking actually completes still depends entirely on a real POST /book call
  // (widgetBook() in controllers/widgetController.ts), which is the only place
  // memory.bookingStatus is ever set to 'booked'. The prompt guidance for both
  // objectives (ResponsePlanner.buildExamples / Humanizer.buildMustMention) is now
  // itself gated on that same field, so the model no longer claims success here —
  // this just makes sure that whenever it reaches for that claim, the frontend has
  // already been told to open the real flow instead.
  const previousObjective  = input.currentObjective ?? null;
  const isBookingObjective = (objective: string | null): boolean =>
    objective === 'offer_appointment' || objective === 'confirm_appointment';
  const bookingTriggered   =
    isBookingObjective(updatedObjective) &&
    !isBookingObjective(previousObjective);

  if (bookingTriggered) {
    if (updatedMemory.bookingStatus === 'none') {
      updatedMemory.bookingStatus = 'requested';
    }
    analyticsEvents.push(makeEvent('booking_triggered', organizationId, conversationId, {
      score: qualification.overall, temperature: qualification.temperature,
    }));
  }

  // ── 14. Summary (on completion / escalation) — trigger point (a) ─────────
  // buildSummary()'s stored write (AIConversationSession.memory.summary) has
  // moved off this synchronous path onto the async pipeline (ai/pipeline/).
  // Confirmed nothing reads output.summary/updatedMemory.summary
  // synchronously today — neither widgetChat() nor aiController.chat()'s
  // response includes it, and aiController's POST /ai/summary recomputes
  // independently rather than reading the stored value — so it's safe to
  // stop computing it here at all, not just stop persisting it.
  if (nextStage === 'completed' || nextStage === 'escalated') {
    enqueueConversationSummary(conversationId, organizationId).catch(err => {
      logger.warn({ err, conversationId, organizationId }, '[Orchestrator] Failed to enqueue conversation summary job');
    });
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
    updatedObjective,
    updatedWorkflowState,
    updatedBlueprintId,
    intent,
    qualification,
    recommendations,
    toolsUsed,
    bookingTriggered,
    // summary is no longer computed synchronously — see step 14 above.
    analyticsEvents,
  };
}

// ─── Intent bridge: legacy classifier → Layer 2 ResolvedIntent shape ────────

/**
 * Builds a Layer 2-shaped ResolvedIntent from the legacy classifier's
 * DetectedIntent so the real Layer 3 orchestrator, ResponseEngine, and
 * PromptAssembler (which all expect ResolvedIntent) can be driven without
 * the standalone intent-engine being wired into the live path.
 */
function buildResolvedIntent(
  intent:         DetectedIntent,
  userMessage:    string,
  conversationId: string,
  turnCount:      number,
): ResolvedIntent {
  return {
    id: `${conversationId}-${turnCount}`,
    category:    mapToIntentCategory(intent.intent),
    subCategory: '',
    confidenceLevel: 'high',
    urgency:     'normal',
    detectedService: null,
    entities:    [],
    candidates:  [],
    reasoning:   '',
    blueprintId: null,
    requiresHuman:        false,
    requiresClarification:false,
    rawMessage:  userMessage,
    timestamp:   new Date(),
  };
}

/**
 * Maps the legacy ai/types IntentType to the Layer 2 IntentCategory.
 * Needed to bridge the legacy classifier output to Layer 4/5 interfaces.
 */
function mapToIntentCategory(intentType: string): import('../intent-engine/types').IntentCategory {
  const map: Record<string, import('../intent-engine/types').IntentCategory> = {
    Booking:    'book_appointment',
    Demo:       'book_appointment',
    Pricing:    'request_estimate',
    Support:    'general_question',   // BUG-L1 fix: was 'repair' — Support is a general question, not a repair request
    Objection:  'complaint',
    Greeting:   'unknown',
    Question:   'general_question',
    Feature:    'general_question',
    Technical:  'general_question',
    Comparison: 'general_question',
    Automation: 'general_question',
    Website:    'general_question',
    LeadFlow:   'general_question',
    Unknown:    'unknown',
  };
  return map[intentType] ?? 'unknown';
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
    updatedObjective:     input.currentObjective   ?? null,
    updatedWorkflowState: input.workflowState      ?? null,
    updatedBlueprintId:   input.currentBlueprintId ?? null,
    intent:          { intent: 'Unknown', confidence: 0, subIntents: [], rawText: input.userMessage },
    qualification:   qualifyLead(input.memory),
    recommendations: [],
    toolsUsed:       [],
    bookingTriggered:false,
    analyticsEvents,
  };
}
