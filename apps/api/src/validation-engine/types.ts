/**
 * validation-engine/types.ts
 *
 * All domain types for Layer 7 — Validation Engine.
 * No business logic. Types only.
 */

import type { ConversationStage, RichConversationMemory, ChatMessage } from '../ai/types';
import type { UrgencyLevel }    from '../intent-engine/types';
import type { BusinessIdentity } from '../business-identity/types';
import type { ResponseBlueprint, Tone } from '../response-engine/types';

// ─── Validation result ────────────────────────────────────────────────────────

export type ValidationStatus = 'pass' | 'fail' | 'warn';

export interface ValidatorResult {
  readonly validator:  string;          // name of the validator that ran
  readonly status:     ValidationStatus;
  readonly reason?:    string;          // why it failed / warned
  readonly field?:     string;          // which field was involved
}

// ─── Pipeline result ──────────────────────────────────────────────────────────

export interface ValidationPipelineResult {
  readonly approved:        boolean;
  readonly finalResponse:   string;       // approved text or fallback
  readonly results:         readonly ValidatorResult[];
  readonly fallbackUsed:    boolean;
  readonly failedValidator: string | null;
  readonly durationMs:      number;
}

// ─── Validation input ─────────────────────────────────────────────────────────

/**
 * Everything a validator needs. Single flat context object.
 * Validators only read what they need — they never mutate.
 */
export interface ValidationContext {
  /** The proposed response text from the Response Engine */
  readonly proposedResponse:  string;
  /** Current conversation stage */
  readonly stage:             ConversationStage;
  /** Active blueprint (objective, tone, CTA, etc.) */
  readonly blueprint:         ResponseBlueprint;
  /** Full memory snapshot */
  readonly memory:            RichConversationMemory;
  /** Conversation history (most-recent last) */
  readonly history:           readonly ChatMessage[];
  /** Intent urgency level */
  readonly urgency:           UrgencyLevel;
  /** Business identity (hours, rules, service area, etc.) */
  readonly identity:          BusinessIdentity;
  /** Turn number (0-indexed) */
  readonly turnCount:         number;
  /** Millis timestamp — injectable for testing */
  readonly nowMs?:            number;
}

// ─── Objective catalogue ──────────────────────────────────────────────────────

export type ConversationObjectiveLabel =
  | 'build_rapport'
  | 'clarify_intent'
  | 'collect_information'
  | 'resolve_confusion'
  | 'offer_appointment'
  | 'confirm_booking'
  | 'handle_objection'
  | 'end_conversation'
  | 'human_handoff';
