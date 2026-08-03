/**
 * response-engine/types.ts
 *
 * All domain types for Layer 4 — Response Engine.
 * No business logic. No imports from outside this module
 * except for the Layer 1–3 types consumed as input.
 */

import type { ConversationStage, RichConversationMemory, QualificationScore, Recommendation } from '../ai/types';
import type { UrgencyLevel, ResolvedIntent }  from '../intent-engine/types';
import type { BusinessIdentity }              from '../business-identity/types';
import type { ConversationPlan as L3Plan, ConversationObjective, WorkflowState } from '../conversation-engine/types';

// ─── Re-export convenience alias ─────────────────────────────────────────────
export type { ConversationStage, UrgencyLevel };

// ─── Tone ─────────────────────────────────────────────────────────────────────

export type Tone =
  | 'Friendly'
  | 'Professional'
  | 'Luxury'
  | 'Calm'
  | 'Confident'
  | 'Consultative'
  | 'Educational'
  | 'Urgent'
  | 'Dispatcher';

// ─── Emotion ──────────────────────────────────────────────────────────────────

export type Emotion =
  | 'Neutral'
  | 'Supportive'
  | 'Concerned'
  | 'Encouraging'
  | 'Excited'
  | 'Apologetic'
  | 'Celebratory';

// ─── Response Length ──────────────────────────────────────────────────────────

export type ResponseLength =
  | 'OneSentence'
  | 'Short'
  | 'Medium'
  | 'Detailed';

// ─── CTA ──────────────────────────────────────────────────────────────────────

export type CTAType =
  | 'ContinueConversation'
  | 'AskQuestion'
  | 'BookAppointment'
  | 'TransferToHuman'
  | 'RecommendService'
  | 'CloseConversation';

// ─── Style ────────────────────────────────────────────────────────────────────

export type ResponseStyle =
  | 'Conversational'
  | 'Dispatcher'
  | 'Advisor'
  | 'Concierge'
  | 'Technical'
  | 'Sales';

// ─── Response Blueprint ───────────────────────────────────────────────────────

/**
 * The immutable output of the Response Engine.
 * Contains ONLY instructions — no reply text.
 * Gemini (or any LLM) receives this and decides how to word the response.
 */
export interface ResponseBlueprint {
  readonly objective:       string;
  readonly tone:            Tone;
  readonly emotion:         Emotion;
  readonly urgency:         UrgencyLevel;
  readonly cta:             CTAType;
  readonly question?:       string;             // the question Gemini should incorporate
  readonly personalization: {
    readonly visitorName?:  string;
    readonly company?:      string;
    readonly service?:      string;
  };
  readonly length:          ResponseLength;
  readonly style:           ResponseStyle;
  readonly mustMention:     readonly string[];  // facts Gemini must include
  readonly mustAvoid:       readonly string[];  // topics/words Gemini must not use
  readonly guardrails:      readonly string[];  // explicit rules for this response
  readonly examples:        readonly string[];  // illustrative examples (no exact wording)
  readonly metadata: {
    readonly industry:      string;
    readonly stage:         ConversationStage;
    readonly objective:     ConversationObjective;
    readonly workflowState: WorkflowState;
  };
}

// ─── Engine input ─────────────────────────────────────────────────────────────

export interface ResponseEngineInput {
  readonly plan:            L3Plan;             // Layer 3 output
  readonly identity:        BusinessIdentity;   // Layer 1
  readonly stage:           ConversationStage;  // legacy stage from ai/types
  readonly memory:          RichConversationMemory;
  readonly intent:          ResolvedIntent;     // Layer 2
  readonly qualification:   QualificationScore;
  readonly recommendations: readonly Recommendation[];
  readonly workflowState:   WorkflowState;
}
