/**
 * tool-orchestration/types.ts
 *
 * Layer 7 — Tool Orchestration Engine.
 * All domain types. No business logic. No imports from external services.
 *
 * Responsibilities:
 *   - Decide WHICH tools to invoke based on conversation context
 *   - Decide HOW to invoke them (parameters, guards, ordering)
 *   - Aggregate results into a ToolOrchestrationResult
 *
 * Tools:
 *   - check_availability   → AvailabilityEngine (pure slot query)
 *   - book_appointment     → BookingService (creates a real booking)
 *   - create_lead          → LeadModel (upsert lead record)
 *   - update_lead          → LeadModel (patch existing lead)
 *   - lookup_faq           → knowledge search
 *   - get_estimate         → rule-based pricing estimate
 *   - send_sms             → communications layer
 *   - send_email           → communications layer
 *   - escalate             → route to human agent
 */

import type { IntentCategory, UrgencyLevel, ResolvedIntent } from '../intent-engine/types';
import type { ConversationObjective, WorkflowState }         from '../conversation-engine/types';
import type { BusinessIdentity }                             from '../business-identity/types';
import type { RichConversationMemory, ConversationStage, QualificationScore } from '../ai/types';

// ─── Tool catalogue ───────────────────────────────────────────────────────────

export type ToolName =
  | 'check_availability'
  | 'book_appointment'
  | 'create_lead'
  | 'update_lead'
  | 'lookup_faq'
  | 'get_estimate'
  | 'send_sms'
  | 'send_email'
  | 'escalate';

// ─── Tool call ────────────────────────────────────────────────────────────────

export interface ToolCall {
  readonly tool:        ToolName;
  readonly params:      Readonly<Record<string, unknown>>;
  readonly reason:      string;     // why this tool was selected
  readonly priority:    'critical' | 'high' | 'medium' | 'low';
  readonly required:    boolean;    // if true, failure blocks the conversation
  readonly idempotent:  boolean;    // safe to retry
}

// ─── Tool result ──────────────────────────────────────────────────────────────

export type ToolResultStatus = 'success' | 'failure' | 'skipped' | 'dry_run';

export interface ToolResult {
  readonly tool:       ToolName;
  readonly status:     ToolResultStatus;
  readonly data:       unknown;
  readonly error?:     string;
  readonly durationMs: number;
  readonly retriedAt?: string;    // ISO timestamp of retry attempt
}

// ─── Availability data ────────────────────────────────────────────────────────

export interface AvailableSlot {
  readonly startLocal:  string;   // ISO string in guest timezone
  readonly endLocal:    string;
  readonly timezone:    string;
  readonly label:       string;   // human-readable: "Monday, Aug 5 at 10:00 AM"
}

export interface AvailabilityResult {
  readonly slots:          readonly AvailableSlot[];
  readonly nextAvailable:  AvailableSlot | null;
  readonly suggested:      readonly AvailableSlot[];  // top 3 suggestions
  readonly hasOpenSlots:   boolean;
}

// ─── Booking data ─────────────────────────────────────────────────────────────

export interface BookingParams {
  readonly guestName:    string;
  readonly guestEmail:   string;
  readonly guestPhone?:  string;
  readonly startUtc:     string;  // ISO string
  readonly timezone:     string;
  readonly notes?:       string;
  readonly serviceType?: string;
  readonly leadId?:      string;
}

export interface BookingResult {
  readonly confirmationCode: string;
  readonly bookingId:        string;
  readonly startLocal:       string;
  readonly serviceType:      string;
  readonly assigneeName?:    string;
}

// ─── Lead data ────────────────────────────────────────────────────────────────

export interface LeadUpsertParams {
  readonly name:         string;
  readonly phone?:       string;
  readonly email?:       string;
  readonly company?:     string;
  readonly service?:     string;
  readonly painPoint?:   string;
  readonly source:       'ai_chat';
}

export interface LeadResult {
  readonly leadId:       string;
  readonly isNew:        boolean;
  readonly status:       string;
}

// ─── Estimate data ────────────────────────────────────────────────────────────

export interface EstimateResult {
  readonly rangeMin:   number;
  readonly rangeMax:   number;
  readonly currency:   string;
  readonly disclaimer: string;
  readonly factors:    readonly string[];
}

// ─── Tool selection context ───────────────────────────────────────────────────

/**
 * All the context the ToolSelector needs to decide which tools to run.
 * Pure data — no methods, no side effects.
 */
export interface ToolSelectionContext {
  readonly organizationId:  string;
  readonly conversationId:  string;
  readonly intent:          ResolvedIntent;
  readonly memory:          RichConversationMemory;
  readonly stage:           ConversationStage;
  readonly workflowState:   WorkflowState;
  readonly objective:       ConversationObjective;
  readonly qualification:   QualificationScore;
  readonly identity:        BusinessIdentity;
  readonly turnCount:       number;
  readonly userMessage:     string;
}

// ─── Orchestration plan ───────────────────────────────────────────────────────

/**
 * The pure, deterministic output of the ToolSelector.
 * Contains the ordered list of tool calls to execute — no execution logic.
 */
export interface ToolOrchestrationPlan {
  readonly calls:         readonly ToolCall[];
  readonly runInParallel: boolean;   // true if all calls are idempotent + independent
  readonly reason:        string;    // overall reasoning
  readonly dryRun:        boolean;   // when true, no write operations occur
}

// ─── Orchestration result ─────────────────────────────────────────────────────

/**
 * The result after executing all tool calls in a plan.
 */
export interface ToolOrchestrationResult {
  readonly plan:              ToolOrchestrationPlan;
  readonly results:           readonly ToolResult[];
  readonly availability?:     AvailabilityResult;
  readonly booking?:          BookingResult;
  readonly lead?:             LeadResult;
  readonly estimate?:         EstimateResult;
  readonly faqAnswer?:        string;
  readonly escalated:         boolean;
  readonly totalDurationMs:   number;
  readonly errors:            readonly string[];
}

// ─── Tool guard ───────────────────────────────────────────────────────────────

/**
 * Pre-execution guard result.
 * Guards are pure functions — no I/O.
 */
export interface ToolGuardResult {
  readonly allowed:  boolean;
  readonly reason?:  string;
  readonly missing?: readonly string[];  // required fields that are absent
}

