/**
 * analytics-engine/types.ts
 *
 * Layer 10 — Analytics Engine domain types.
 * Single source of truth. No business logic. Types only.
 */

import type { ConversationStage } from '../ai/types';
import type { IntentCategory, UrgencyLevel } from '../intent-engine/types';
import type { EscalationReason, HandoffDestination } from '../handoff-engine/types';
import type { BookingValidationCode } from '../booking-engine/types';

// ─── Analytics event types ────────────────────────────────────────────────────

export type AnalyticsEventType =
  // Conversation lifecycle
  | 'conversation_started'
  | 'conversation_completed'
  | 'conversation_abandoned'
  | 'stage_transition'
  | 'turn_completed'
  // Intent
  | 'intent_detected'
  | 'intent_clarified'
  // Booking
  | 'booking_requested'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'booking_failed'
  // Validation
  | 'validation_passed'
  | 'validation_failed'
  | 'fallback_used'
  | 'hallucination_prevented'
  | 'repetition_blocked'
  // Memory
  | 'memory_updated'
  | 'field_collected'
  // Handoff
  | 'handoff_requested'
  | 'handoff_completed'
  | 'handoff_cancelled'
  | 'human_requested'
  | 'ai_confidence_low'
  | 'complaint_detected'
  // Performance
  | 'response_generated'
  | 'blueprint_changed';

// ─── Analytics event ──────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  readonly type:           AnalyticsEventType;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly occurredAt:     string;   // ISO timestamp
  readonly payload:        Readonly<Record<string, unknown>>;
}

// ─── Conversation metrics ─────────────────────────────────────────────────────

export interface ConversationMetrics {
  readonly total:            number;
  readonly completed:        number;
  readonly abandoned:        number;
  readonly completionRate:   number;   // 0–100
  readonly abandonmentRate:  number;   // 0–100
  readonly avgTurns:         number;
  readonly avgDurationMs:    number;
  readonly p50DurationMs:    number;
  readonly p95DurationMs:    number;
}

// ─── Intent metrics ───────────────────────────────────────────────────────────

export interface IntentMetricEntry {
  readonly intent:         IntentCategory | string;
  readonly count:          number;
  readonly conversions:    number;   // led to booking
  readonly abandonments:   number;
  readonly conversionRate: number;   // 0–100
}

export interface IntentMetrics {
  readonly byIntent:      readonly IntentMetricEntry[];
  readonly topIntent:     IntentCategory | string | null;
  readonly totalDetected: number;
}

// ─── Booking metrics ──────────────────────────────────────────────────────────

export interface BookingMetrics {
  readonly attempts:          number;
  readonly confirmed:         number;
  readonly failed:            number;
  readonly cancelled:         number;
  readonly rescheduled:       number;
  readonly conversionRate:    number;   // confirmed / attempts × 100
  readonly topFailureReason:  BookingValidationCode | null;
  readonly failuresByReason:  Readonly<Partial<Record<BookingValidationCode, number>>>;
}

// ─── Validation metrics ───────────────────────────────────────────────────────

export interface ValidationMetrics {
  readonly totalChecked:          number;
  readonly passed:                number;
  readonly failed:                number;
  readonly failRate:              number;   // 0–100
  readonly falllbacksUsed:        number;
  readonly hallucinationsPrevented:number;
  readonly repetitionsBlocked:    number;
  readonly failsByValidator:      Readonly<Record<string, number>>;
}

// ─── Memory metrics ───────────────────────────────────────────────────────────

export interface MemoryMetrics {
  readonly avgFieldsCollected:  number;
  readonly completionRate:      number;   // 0–100 avg across conversations
  readonly fieldCoverage:       Readonly<Record<string, number>>;   // field → % collected
  readonly lowConfidenceRate:   number;   // % of fields below confidence threshold
}

// ─── Handoff metrics ──────────────────────────────────────────────────────────

export interface HandoffMetrics {
  readonly total:              number;
  readonly humanRequests:      number;
  readonly complaints:         number;
  readonly confidenceEscalations: number;
  readonly billingEscalations: number;
  readonly emergencyEscalations:  number;
  readonly byReason:           Readonly<Partial<Record<EscalationReason, number>>>;
  readonly byDestination:      Readonly<Partial<Record<HandoffDestination, number>>>;
  readonly handoffRate:        number;   // handoffs / conversations × 100
}

// ─── Funnel stage ─────────────────────────────────────────────────────────────

export interface FunnelStage {
  readonly stage:          ConversationStage | 'visitor';
  readonly entered:        number;
  readonly exited:         number;
  readonly converted:      number;   // moved to next stage
  readonly abandoned:      number;   // left without converting
  readonly conversionRate: number;   // 0–100
  readonly abandonRate:    number;   // 0–100
  readonly avgTimeMs:      number;
}

export interface FunnelMetrics {
  readonly stages:       readonly FunnelStage[];
  readonly overallRate:  number;   // visitor → booking
  readonly biggestDropoff: ConversationStage | 'visitor' | null;
}

// ─── Performance metrics ──────────────────────────────────────────────────────

export interface LatencyBucket {
  readonly label:    string;   // e.g. 'response_generated'
  readonly p50Ms:    number;
  readonly p95Ms:    number;
  readonly avgMs:    number;
  readonly samples:  number;
}

export interface PerformanceMetrics {
  readonly buckets:  readonly LatencyBucket[];
  readonly overall:  LatencyBucket;
}

// ─── Dashboard snapshot ───────────────────────────────────────────────────────

export interface PeriodSnapshot {
  readonly visitors:      number;
  readonly conversations: number;
  readonly bookings:      number;
  readonly bookingRate:   number;   // 0–100
  readonly handoffs:      number;
  readonly handoffRate:   number;   // 0–100
  readonly completions:   number;
  readonly abandonments:  number;
}

export interface DashboardSnapshot {
  readonly organizationId:  string;
  readonly today:           PeriodSnapshot;
  readonly thisWeek:        PeriodSnapshot;
  readonly thisMonth:       PeriodSnapshot;
  readonly generatedAt:     string;   // ISO
}

// ─── Analytics report ─────────────────────────────────────────────────────────

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export interface AnalyticsReport {
  readonly organizationId:  string;
  readonly period:          ReportPeriod;
  readonly from:            string;   // ISO date
  readonly to:              string;   // ISO date
  readonly conversations:   ConversationMetrics;
  readonly intents:         IntentMetrics;
  readonly bookings:        BookingMetrics;
  readonly validations:     ValidationMetrics;
  readonly memory:          MemoryMetrics;
  readonly handoffs:        HandoffMetrics;
  readonly funnel:          FunnelMetrics;
  readonly performance:     PerformanceMetrics;
  readonly generatedAt:     string;
}

// ─── Event store (in-memory, for pure aggregation) ────────────────────────────

export interface EventStore {
  readonly events:          readonly AnalyticsEvent[];
  readonly organizationId:  string;
}
