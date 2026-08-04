/**
 * analytics-engine/EventProcessor.ts
 *
 * Validates and normalises incoming analytics events.
 * Rejects malformed events before they enter the aggregation pipeline.
 *
 * PURE — no I/O, no side effects.
 */

import type { AnalyticsEvent, AnalyticsEventType } from './types';

const VALID_EVENT_TYPES = new Set<AnalyticsEventType>([
  'conversation_started', 'conversation_completed', 'conversation_abandoned',
  'stage_transition', 'turn_completed',
  'intent_detected', 'intent_clarified',
  'booking_requested', 'booking_confirmed', 'booking_cancelled',
  'booking_rescheduled', 'booking_failed',
  'validation_passed', 'validation_failed', 'fallback_used',
  'hallucination_prevented', 'repetition_blocked',
  'memory_updated', 'field_collected',
  'handoff_requested', 'handoff_completed', 'handoff_cancelled',
  'human_requested', 'ai_confidence_low', 'complaint_detected',
  'response_generated', 'blueprint_changed',
]);

export interface ProcessResult {
  readonly valid:    boolean;
  readonly event?:   AnalyticsEvent;
  readonly reason?:  string;
}

export const EventProcessor = {

  /** Validate and normalise a single event. */
  process(raw: Partial<AnalyticsEvent>): ProcessResult {
    if (!raw.type || !VALID_EVENT_TYPES.has(raw.type as AnalyticsEventType)) {
      return { valid: false, reason: `Unknown event type: ${raw.type}` };
    }
    if (!raw.organizationId?.trim()) {
      return { valid: false, reason: 'Missing organizationId' };
    }
    if (!raw.conversationId?.trim()) {
      return { valid: false, reason: 'Missing conversationId' };
    }

    const event: AnalyticsEvent = {
      type:           raw.type as AnalyticsEventType,
      organizationId: raw.organizationId,
      conversationId: raw.conversationId,
      occurredAt:     raw.occurredAt ?? new Date().toISOString(),
      payload:        raw.payload ?? {},
    };

    return { valid: true, event };
  },

  /** Process a batch, silently dropping invalid events. */
  processBatch(raws: Partial<AnalyticsEvent>[]): AnalyticsEvent[] {
    return raws
      .map(r => EventProcessor.process(r))
      .filter(r => r.valid && r.event)
      .map(r => r.event!);
  },

  /** Filter events by org and time range. */
  filter(
    events:  readonly AnalyticsEvent[],
    orgId:   string,
    fromIso: string,
    toIso:   string,
  ): AnalyticsEvent[] {
    const from = new Date(fromIso).getTime();
    const to   = new Date(toIso).getTime();
    return events.filter(e =>
      e.organizationId === orgId &&
      new Date(e.occurredAt).getTime() >= from &&
      new Date(e.occurredAt).getTime() <= to,
    );
  },

  /** Filter events for a single conversation. */
  forConversation(events: readonly AnalyticsEvent[], conversationId: string): AnalyticsEvent[] {
    return events.filter(e => e.conversationId === conversationId);
  },
};
