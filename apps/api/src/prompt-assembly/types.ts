/**
 * prompt-assembly/types.ts
 *
 * All domain types for Layer 5 — Prompt Assembly.
 * No business logic. Types only.
 */

import type { ConversationStage, RichConversationMemory, QualificationScore, Recommendation, ChatMessage, KnowledgeEntry } from '../ai/types';
import type { BusinessIdentity }    from '../business-identity/types';
import type { ResolvedIntent }      from '../intent-engine/types';
import type { ConversationPlan as L3Plan } from '../conversation-engine/types';
import type { ResponseBlueprint }   from '../response-engine/types';

// ─── Section tag definitions ──────────────────────────────────────────────────

/** The ordered set of sections every prompt must contain exactly once */
export type PromptSection =
  | 'SYSTEM'
  | 'BUSINESS_IDENTITY'
  | 'CONVERSATION_MEMORY'
  | 'CURRENT_OBJECTIVE'
  | 'CONVERSATION_PLAN'
  | 'RESPONSE_BLUEPRINT'
  | 'KNOWLEDGE'
  | 'RECOMMENDATIONS'
  | 'CONVERSATION_HISTORY'
  | 'GUARDRAILS'
  | 'FINAL_INSTRUCTIONS';

/** Ordered list — sections must appear in this exact sequence */
export const SECTION_ORDER: readonly PromptSection[] = [
  'SYSTEM',
  'BUSINESS_IDENTITY',
  'CONVERSATION_MEMORY',
  'CURRENT_OBJECTIVE',
  'CONVERSATION_PLAN',
  'RESPONSE_BLUEPRINT',
  'KNOWLEDGE',
  'RECOMMENDATIONS',
  'CONVERSATION_HISTORY',
  'GUARDRAILS',
  'FINAL_INSTRUCTIONS',
];

// ─── Assembler input ──────────────────────────────────────────────────────────

export interface PromptAssemblerInput {
  readonly identity:        BusinessIdentity;           // Layer 1
  readonly plan:            L3Plan;                     // Layer 3
  readonly blueprint:       ResponseBlueprint;          // Layer 4
  readonly memory:          RichConversationMemory;
  readonly qualification:   QualificationScore;
  readonly intent:          ResolvedIntent;             // Layer 2
  readonly knowledgeHits:   readonly KnowledgeEntry[];
  readonly recommendations: readonly Recommendation[];
  readonly history:         readonly ChatMessage[];
  readonly currentPage?:    string;
  readonly stage:           ConversationStage;
  /** Maximum history messages to include (default: 20) */
  readonly maxHistory?:     number;
  /** Maximum knowledge snippets to include (default: 3) */
  readonly maxKnowledge?:   number;
}

// ─── Renderer Prompt ─────────────────────────────────────────────────────────

/**
 * The structured output of the Prompt Assembler.
 * Gemini receives this — nothing else.
 */
export interface RendererPrompt {
  /** The main system prompt Gemini reads as context */
  readonly systemPrompt:      string;
  /** Serialized knowledge snippets (injected as leading context) */
  readonly knowledgeBlock:    string;
  /** Serialized conversation memory */
  readonly memoryBlock:       string;
  /** Serialized conversation history */
  readonly conversationBlock: string;
  /** Instruction block (objective + plan + blueprint merged) */
  readonly instructionBlock:  string;
  /** Safety and business guardrails */
  readonly guardrailBlock:    string;
  /** Serialized ResponseBlueprint as renderer instructions */
  readonly responseBlueprint: string;
  readonly metadata: {
    /** Rough word-count-based token estimate */
    readonly tokenEstimate:       number;
    readonly compressionApplied:  boolean;
    readonly sectionsIncluded:    readonly PromptSection[];
  };
}
