/**
 * prompt-assembly/PromptAssembler.ts
 *
 * Layer 5 — Prompt Assembly.
 * The single entry point for constructing renderer prompts.
 *
 * Replaces buildSystemPrompt() in the orchestrator.
 * Gemini receives the output of this module — nothing else.
 *
 * Pure. No DB. No LLM. No side effects.
 */

import type { PromptAssemblerInput, RendererPrompt, PromptSection } from './types';
import { SECTION_ORDER } from './types';
import { serializeMemory }           from './MemorySerializer';
import { serializeConversation }     from './ConversationSerializer';
import { serializeKnowledge }        from './KnowledgeSerializer';
import { serializeRecommendations }  from './RecommendationSerializer';
import { serializeGuardrails }       from './GuardrailSerializer';
import { serializeBlueprint }        from './RendererPrompt';
import { composeInstructions }       from './InstructionComposer';
import { compress, estimateTokensFromParts, normalizeWhitespace } from './ContextCompressor';
import { joinSections } from './PromptSections';

// ─── System prompt header ─────────────────────────────────────────────────────

function buildSystemHeader(params: {
  aiName:       string;
  businessName: string;
  industry:     string;
  timezone:     string;
}): string {
  return [
    `You are ${params.aiName}, an AI receptionist for ${params.businessName}.`,
    `Industry: ${params.industry}. Timezone: ${params.timezone}.`,
    `You are a renderer. You receive structured instructions and produce a single natural-language response.`,
    `Follow every instruction exactly. Never deviate from the Response Blueprint.`,
    `Never generate multiple responses. Never ask more than one question.`,
  ].join('\n');
}

// ─── Final instruction footer ─────────────────────────────────────────────────

function buildFinalInstructions(blueprint: NonNullable<PromptAssemblerInput['blueprint']>): string {
  return [
    `Generate exactly ONE response that:`,
    `1. Matches the tone: ${blueprint.tone}`,
    `2. Expresses the emotion: ${blueprint.emotion}`,
    `3. Has the length: ${blueprint.length}`,
    `4. Ends with the CTA: ${blueprint.cta}`,
    blueprint.question ? `5. Incorporates this question naturally: "${blueprint.question}"` : '',
    `Do NOT repeat information the customer has already provided.`,
    `Do NOT ask more than one question.`,
    `Do NOT fabricate any information.`,
  ].filter(Boolean).join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const PromptAssembler = {

  /**
   * Build a complete RendererPrompt from Layer 1–4 outputs.
   * Pure — no async, no I/O, no side effects.
   */
  build(input: PromptAssemblerInput): RendererPrompt {
    const {
      identity, plan, blueprint, memory, qualification, intent,
      knowledgeHits, recommendations, history, currentPage, stage,
    } = input;

    const maxHistory  = input.maxHistory  ?? 20;
    const maxKnow     = input.maxKnowledge ?? 3;

    // ── 1. Compress context ───────────────────────────────────────────────
    const { history: compHistory, recommendations: compRecs, compressionApplied } = compress({
      history, recommendations, maxHistory,
    });

    // ── 2. Serialize each section ─────────────────────────────────────────
    const ri = identity.receptionistIdentity;
    const cp = identity.companyProfile;

    const systemHeader    = buildSystemHeader({
      aiName:       ri.aiName,
      businessName: cp.businessName,
      industry:     cp.industry as string,
      timezone:     identity.contactInfo.timezone,
    });

    const memoryBlock       = serializeMemory(memory);
    const conversationBlock = serializeConversation(compHistory, maxHistory);
    const knowledgeBlock    = serializeKnowledge(knowledgeHits, maxKnow);
    const recsBlock         = serializeRecommendations(compRecs);
    const blueprintBlock    = serializeBlueprint(blueprint);
    const guardrailBlock    = serializeGuardrails(blueprint);
    const instructionBlock  = composeInstructions({ identity, plan, blueprint, qualification, currentPage });
    const finalInstr        = buildFinalInstructions(blueprint);

    // ── 3. Business identity block ────────────────────────────────────────
    const bizBlock = [
      `Company: ${cp.businessName}`,
      `Industry: ${cp.industry}`,
      cp.description ? `Description: ${cp.description}` : '',
      identity.servicesCatalog.filter(s => s.enabled).length > 0
        ? `Services: ${identity.servicesCatalog.filter(s => s.enabled).map(s => s.name).join(', ')}`
        : '',
    ].filter(Boolean).join('\n');

    // ── 4. Objective block ────────────────────────────────────────────────
    const objectiveBlock = [
      `Stage: ${stage}`,
      `Objective: ${plan.objective}`,
      `Priority: ${plan.priority}`,
      plan.requiredField ? `Collecting: ${plan.requiredField}` : '',
    ].filter(Boolean).join('\n');

    // ── 5. Plan block ─────────────────────────────────────────────────────
    const planBlock = [
      `Reason: ${plan.reason}`,
      plan.completionCriteria.length > 0
        ? `Complete when: ${plan.completionCriteria.join(', ')}`
        : '',
    ].filter(Boolean).join('\n');

    // ── 6. Assemble in section order ──────────────────────────────────────
    const sectionMap: Record<PromptSection, string> = {
      SYSTEM:                normalizeWhitespace(systemHeader),
      BUSINESS_IDENTITY:     normalizeWhitespace(bizBlock),
      CONVERSATION_MEMORY:   normalizeWhitespace(memoryBlock),
      CURRENT_OBJECTIVE:     normalizeWhitespace(objectiveBlock),
      CONVERSATION_PLAN:     normalizeWhitespace(planBlock),
      RESPONSE_BLUEPRINT:    normalizeWhitespace(blueprintBlock),
      KNOWLEDGE:             normalizeWhitespace(knowledgeBlock),
      RECOMMENDATIONS:       normalizeWhitespace(recsBlock),
      CONVERSATION_HISTORY:  normalizeWhitespace(conversationBlock),
      GUARDRAILS:            normalizeWhitespace(guardrailBlock),
      FINAL_INSTRUCTIONS:    normalizeWhitespace(finalInstr),
    };

    const orderedSections = SECTION_ORDER.map(name => ({
      name,
      content: sectionMap[name],
    }));

    const { text: systemPrompt, sectionsIncluded } = joinSections(orderedSections);

    // ── 7. Token estimate ─────────────────────────────────────────────────
    const tokenEstimate = estimateTokensFromParts([
      systemPrompt, knowledgeBlock, memoryBlock,
      conversationBlock, instructionBlock, guardrailBlock, blueprintBlock,
    ]);

    return Object.freeze({
      systemPrompt:      normalizeWhitespace(systemPrompt),
      knowledgeBlock:    normalizeWhitespace(knowledgeBlock),
      memoryBlock:       normalizeWhitespace(memoryBlock),
      conversationBlock: normalizeWhitespace(conversationBlock),
      instructionBlock:  normalizeWhitespace(instructionBlock),
      guardrailBlock:    normalizeWhitespace(guardrailBlock),
      responseBlueprint: normalizeWhitespace(blueprintBlock),
      metadata: Object.freeze({
        tokenEstimate,
        compressionApplied,
        sectionsIncluded: Object.freeze([...sectionsIncluded]),
      }),
    });
  },
};
