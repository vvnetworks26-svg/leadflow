/**
 * handoff-engine/types.ts
 *
 * Layer 9 — Human Handoff Engine domain types.
 * Single source of truth. No business logic. Types only.
 */

import type { ConversationStage, RichConversationMemory, ChatMessage } from '../ai/types';
import type { UrgencyLevel, IntentCategory } from '../intent-engine/types';
import type { BusinessIdentity } from '../business-identity/types';

// ─── Escalation reason ────────────────────────────────────────────────────────

export type EscalationReason =
  | 'customer_requested_human'
  | 'low_ai_confidence'
  | 'repeated_clarification_failure'
  | 'complaint_detected'
  | 'frustration_detected'
  | 'billing_question'
  | 'legal_issue'
  | 'payment_issue'
  | 'profanity_detected'
  | 'unsupported_request'
  | 'business_rule'
  | 'booking_completed'
  | 'emergency_escalation'
  | 'vip_customer'
  | 'office_hours_only';

// ─── Handoff destination ──────────────────────────────────────────────────────

export type HandoffDestination =
  | 'dispatcher'
  | 'sales_team'
  | 'manager'
  | 'office_staff'
  | 'customer_support'
  | 'billing_department'
  | 'technical_support'
  | 'default';

// ─── Handoff priority ─────────────────────────────────────────────────────────

export type HandoffPriority = 'critical' | 'high' | 'normal' | 'low';

// ─── Handoff status ───────────────────────────────────────────────────────────

export type HandoffStatus = 'requested' | 'completed' | 'cancelled';

// ─── Handoff event type ───────────────────────────────────────────────────────

export type HandoffEventType =
  | 'handoff_requested'
  | 'handoff_completed'
  | 'handoff_cancelled'
  | 'human_requested'
  | 'ai_confidence_low'
  | 'complaint_detected';

// ─── Collected information ────────────────────────────────────────────────────

export interface CollectedInfo {
  readonly name?:          string;
  readonly phone?:         string;
  readonly email?:         string;
  readonly address?:       string;
  readonly service?:       string;
  readonly preferredTime?: string;
  readonly company?:       string;
  readonly notes?:         string;
}

// ─── Conversation summary ─────────────────────────────────────────────────────

export interface HandoffSummary {
  readonly customer:              CollectedInfo;
  readonly service:               string | null;
  readonly intent:                IntentCategory | null;
  readonly urgency:               UrgencyLevel;
  readonly conversationStage:     ConversationStage;
  readonly informationCollected:  readonly string[];
  readonly missingInformation:    readonly string[];
  readonly reasonForHandoff:      EscalationReason;
  readonly reasonDescription:     string;
  readonly bookingStatus:         'none' | 'requested' | 'booked';
  readonly painPoints:            readonly string[];
  readonly objections:            readonly string[];
  readonly turnCount:             number;
  readonly generatedAt:           string;  // ISO
}

// ─── Agent context ────────────────────────────────────────────────────────────

export interface AgentContext {
  readonly summary:          HandoffSummary;
  readonly recentHistory:    readonly ChatMessage[];  // last 5 turns
  readonly businessName:     string;
  readonly businessPhone:    string;
  readonly industry:         string;
  readonly priority:         HandoffPriority;
  readonly destination:      HandoffDestination;
  readonly handoffId:        string;
  readonly conversationId:   string;
  readonly organizationId:   string;
  readonly createdAt:        string;  // ISO
  /** Plain text brief for the agent — key facts in 3-4 lines */
  readonly agentBrief:       string;
}

// ─── Handoff result ───────────────────────────────────────────────────────────

export interface HandoffResult {
  readonly shouldHandoff:  boolean;
  readonly reason:         EscalationReason | null;
  readonly priority:       HandoffPriority;
  readonly destination:    HandoffDestination;
  readonly summary?:       HandoffSummary;
  readonly context?:       AgentContext;
  readonly event?:         HandoffEvent;
  /** Message the AI should show the customer before handoff */
  readonly bridgeMessage:  string;
}

// ─── Handoff event ────────────────────────────────────────────────────────────

export interface HandoffEvent {
  readonly type:           HandoffEventType;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly reason:         EscalationReason;
  readonly priority:       HandoffPriority;
  readonly destination:    HandoffDestination;
  readonly summary?:       HandoffSummary;
  readonly occurredAt:     string;  // ISO
}

// ─── Escalation input ─────────────────────────────────────────────────────────

export interface EscalationInput {
  readonly organizationId:   string;
  readonly conversationId:   string;
  readonly memory:           RichConversationMemory;
  readonly history:          readonly ChatMessage[];
  readonly stage:            ConversationStage;
  readonly urgency:          UrgencyLevel;
  readonly intentCategory:   IntentCategory;
  readonly confidenceScore:  number;          // 0–100
  readonly turnCount:        number;
  readonly identity:         BusinessIdentity;
  readonly clarificationAttempts?: number;    // consecutive low-confidence turns
  readonly nowMs?:           number;          // injectable clock
}

// ─── Routing policy ───────────────────────────────────────────────────────────

export interface RoutingRule {
  readonly reason:      EscalationReason;
  readonly destination: HandoffDestination;
  readonly priority:    HandoffPriority;
  readonly enabled:     boolean;
}

export interface HandoffPolicy {
  readonly rules:                  readonly RoutingRule[];
  readonly defaultDestination:     HandoffDestination;
  readonly defaultPriority:        HandoffPriority;
  readonly officeHoursOnly:        boolean;
  readonly alwaysHandoffAfterBooking: boolean;
  readonly maxClarificationAttempts:  number;
  readonly confidenceThreshold:    number;   // 0–100: escalate below this
}
