/**
 * analytics-engine/__tests__/analytics-engine.test.ts
 *
 * Layer 10 — Analytics Engine Test Suite
 * 120+ deterministic unit tests. No DB. No Gemini. No network.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AnalyticsEngine }               from '../AnalyticsEngine';
import { AnalyticsCoordinator }          from '../AnalyticsCoordinator';
import { EventProcessor }                from '../EventProcessor';
import { EventAggregator }               from '../EventAggregator';
import { MetricsCalculator }             from '../MetricsCalculator';
import { ConversationMetricsCalculator } from '../ConversationMetrics';
import { BookingMetricsCalculator }      from '../BookingMetrics';
import { IntentMetricsCalculator }       from '../IntentMetrics';
import { ValidationMetricsCalculator }   from '../ValidationMetrics';
import { MemoryMetricsCalculator }       from '../MemoryMetrics';
import { HandoffMetricsCalculator }      from '../HandoffMetrics';
import { FunnelAnalyzer }                from '../FunnelAnalyzer';
import { DropoffAnalyzer }               from '../DropoffAnalyzer';
import { PerformanceAnalyzer }           from '../PerformanceAnalyzer';
import { DashboardSnapshotBuilder }      from '../DashboardSnapshot';
import { AnalyticsReportBuilder }        from '../AnalyticsReport';

import type { AnalyticsEvent } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG = 'org-test';
const NOW  = new Date('2026-08-04T14:00:00Z').getTime();

function ev(
  type:           AnalyticsEvent['type'],
  conversationId: string,
  payload:        Record<string, unknown> = {},
  offsetMs        = 0,
): AnalyticsEvent {
  return {
    type,
    organizationId: ORG,
    conversationId,
    occurredAt:     new Date(NOW + offsetMs).toISOString(),
    payload,
  };
}

/** Build a complete happy-path conversation: started → intent → booking → completed */
function happyPath(convId: string, offsetMs = 0): AnalyticsEvent[] {
  return [
    ev('conversation_started', convId, {}, offsetMs),
    ev('intent_detected',      convId, { intent: 'repair' }, offsetMs + 1000),
    ev('turn_completed',       convId, {}, offsetMs + 2000),
    ev('turn_completed',       convId, {}, offsetMs + 4000),
    ev('stage_transition',     convId, { from: 'greeting', to: 'discovery' }, offsetMs + 1000),
    ev('stage_transition',     convId, { from: 'discovery', to: 'booking' }, offsetMs + 8000),
    ev('booking_requested',    convId, {}, offsetMs + 10000),
    ev('booking_confirmed',    convId, {}, offsetMs + 11000),
    ev('conversation_completed', convId, {}, offsetMs + 12000),
  ];
}

/** Build an abandoned conversation */
function abandonedPath(convId: string, stage = 'discovery', offsetMs = 0): AnalyticsEvent[] {
  return [
    ev('conversation_started',   convId, {}, offsetMs),
    ev('intent_detected',        convId, { intent: 'maintenance' }, offsetMs + 1000),
    ev('stage_transition',       convId, { from: 'greeting', to: stage }, offsetMs + 2000),
    ev('conversation_abandoned', convId, {}, offsetMs + 5000),
  ];
}

// ─── 1. EventProcessor ───────────────────────────────────────────────────────

describe('EventProcessor.process', () => {
  it('accepts a valid event', () => {
    const r = EventProcessor.process(ev('conversation_started', 'c1'));
    assert.equal(r.valid, true);
    assert.ok(r.event !== undefined);
  });

  it('rejects unknown event type', () => {
    const r = EventProcessor.process({ type: 'not_real' as any, organizationId: ORG, conversationId: 'c1' });
    assert.equal(r.valid, false);
    assert.ok(r.reason?.includes('Unknown'));
  });

  it('rejects missing organizationId', () => {
    const r = EventProcessor.process({ type: 'conversation_started', conversationId: 'c1' });
    assert.equal(r.valid, false);
  });

  it('rejects missing conversationId', () => {
    const r = EventProcessor.process({ type: 'conversation_started', organizationId: ORG });
    assert.equal(r.valid, false);
  });

  it('fills in occurredAt if missing', () => {
    const r = EventProcessor.process({ type: 'conversation_started', organizationId: ORG, conversationId: 'c1' });
    assert.ok(r.event!.occurredAt.length > 0);
  });

  it('processBatch drops invalid events silently', () => {
    const events = EventProcessor.processBatch([
      ev('conversation_started', 'c1'),
      { type: 'invalid' as any, organizationId: ORG, conversationId: 'c2' },
      ev('booking_confirmed', 'c3'),
    ]);
    assert.equal(events.length, 2);
  });

  it('filter returns only org events in window', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1', {}, 0),
      ev('conversation_started', 'c2', {}, -2 * 86400_000),   // 2 days ago
    ];
    const fromIso = new Date(NOW - 86400_000).toISOString();   // 1 day ago
    const toIso   = new Date(NOW + 60_000).toISOString();
    const result  = EventProcessor.filter(events, ORG, fromIso, toIso);
    assert.equal(result.length, 1);
  });

  it('forConversation filters by conversationId', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1'),
      ev('conversation_started', 'c2'),
    ];
    assert.equal(EventProcessor.forConversation(events, 'c1').length, 1);
  });
});

// ─── 2. MetricsCalculator ────────────────────────────────────────────────────

describe('MetricsCalculator', () => {
  it('pct: 10/50 = 20', () => assert.equal(MetricsCalculator.pct(10, 50), 20));
  it('pct: 0 total returns 0', () => assert.equal(MetricsCalculator.pct(5, 0), 0));
  it('avg: [10,20,30] = 20', () => assert.equal(MetricsCalculator.avg([10, 20, 30]), 20));
  it('avg: empty = 0', () => assert.equal(MetricsCalculator.avg([]), 0));
  it('percentile p50 of [1,2,3,4,5]', () => {
    assert.equal(MetricsCalculator.percentile([1, 2, 3, 4, 5], 50), 3);
  });
  it('percentile p95 >= p50', () => {
    const arr = [1,2,3,4,5,6,7,8,9,10];
    assert.ok(MetricsCalculator.percentile(arr, 95) >= MetricsCalculator.percentile(arr, 50));
  });
  it('percentile empty = 0', () => assert.equal(MetricsCalculator.percentile([], 50), 0));
  it('sumMap sums all values', () => assert.equal(MetricsCalculator.sumMap({ a: 3, b: 7 }), 10));
  it('topN returns sorted top entries', () => {
    const top = MetricsCalculator.topN({ repair: 10, install: 5, maintenance: 8 }, 2);
    assert.equal(top[0]!.key, 'repair');
    assert.equal(top.length, 2);
  });
});

// ─── 3. ConversationMetrics ───────────────────────────────────────────────────

describe('ConversationMetricsCalculator', () => {
  it('counts started, completed, abandoned', () => {
    const events = [...happyPath('c1'), ...abandonedPath('c2')];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.total, 2);
    assert.equal(m.completed, 1);
    assert.equal(m.abandoned, 1);
  });

  it('completionRate = 50 for 1 completed out of 2', () => {
    const events = [...happyPath('c1'), ...abandonedPath('c2')];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.completionRate, 50);
    assert.equal(m.abandonmentRate, 50);
  });

  it('avgTurns counts turn_completed per conversation', () => {
    const events = happyPath('c1');  // has 2 turn_completed
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.avgTurns, 2);
  });

  it('avgDurationMs measured from start to completed', () => {
    const events = happyPath('c1', 0);  // 12000ms from start to completed
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.avgDurationMs, 12000);
  });

  it('p50 and p95 are non-negative', () => {
    const events = [...happyPath('c1'), ...happyPath('c2', 100)];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.ok(m.p50DurationMs >= 0);
    assert.ok(m.p95DurationMs >= m.p50DurationMs);
  });

  it('empty events returns zeros', () => {
    const m = ConversationMetricsCalculator.calculate([]);
    assert.equal(m.total, 0);
    assert.equal(m.completionRate, 0);
  });
});

// ─── 4. BookingMetrics ───────────────────────────────────────────────────────

describe('BookingMetricsCalculator', () => {
  it('counts attempts, confirmed, cancelled, failed', () => {
    const events: AnalyticsEvent[] = [
      ev('booking_requested', 'c1'),
      ev('booking_confirmed', 'c1'),
      ev('booking_requested', 'c2'),
      ev('booking_failed',    'c2', { errorCode: 'MISSING_PHONE' }),
      ev('booking_requested', 'c3'),
      ev('booking_cancelled', 'c3'),
    ];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(m.attempts, 3);
    assert.equal(m.confirmed, 1);
    assert.equal(m.failed, 1);
    assert.equal(m.cancelled, 1);
  });

  it('conversionRate = 50 for 1 confirmed out of 2 attempts', () => {
    const events: AnalyticsEvent[] = [
      ev('booking_requested', 'c1'),
      ev('booking_confirmed', 'c1'),
      ev('booking_requested', 'c2'),
      ev('booking_failed', 'c2', {}),
    ];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(m.conversionRate, 50);
  });

  it('topFailureReason is the most common failure code', () => {
    const events: AnalyticsEvent[] = [
      ev('booking_failed', 'c1', { errorCode: 'MISSING_PHONE' }),
      ev('booking_failed', 'c2', { errorCode: 'MISSING_PHONE' }),
      ev('booking_failed', 'c3', { errorCode: 'MISSING_NAME' }),
    ];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(m.topFailureReason, 'MISSING_PHONE');
  });

  it('rescheduled is counted', () => {
    const events: AnalyticsEvent[] = [ev('booking_rescheduled', 'c1')];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(m.rescheduled, 1);
  });

  it('zero attempts returns 0 conversionRate', () => {
    const m = BookingMetricsCalculator.calculate([]);
    assert.equal(m.conversionRate, 0);
    assert.equal(m.topFailureReason, null);
  });
});

// ─── 5. IntentMetrics ────────────────────────────────────────────────────────

describe('IntentMetricsCalculator', () => {
  it('counts intents', () => {
    const events: AnalyticsEvent[] = [
      ev('intent_detected', 'c1', { intent: 'repair' }),
      ev('intent_detected', 'c2', { intent: 'repair' }),
      ev('intent_detected', 'c3', { intent: 'installation' }),
    ];
    const m = IntentMetricsCalculator.calculate(events);
    assert.equal(m.totalDetected, 3);
    assert.equal(m.topIntent, 'repair');
    assert.equal(m.byIntent.find(i => i.intent === 'repair')?.count, 2);
  });

  it('conversionRate populated when booking follows intent', () => {
    const events: AnalyticsEvent[] = [
      ev('intent_detected',  'c1', { intent: 'repair' }),
      ev('booking_confirmed', 'c1'),
      ev('intent_detected',  'c2', { intent: 'repair' }),
      ev('conversation_abandoned', 'c2'),
    ];
    const m = IntentMetricsCalculator.calculate(events);
    const repairEntry = m.byIntent.find(i => i.intent === 'repair')!;
    assert.equal(repairEntry.conversionRate, 50);
    assert.equal(repairEntry.abandonments, 1);
  });

  it('all supported intents can be tracked', () => {
    const intents = ['repair', 'installation', 'maintenance', 'emergency_service', 'billing_question', 'request_estimate', 'warranty', 'employment', 'general_question'];
    const events = intents.map((intent, i) => ev('intent_detected', `c${i}`, { intent }));
    const m = IntentMetricsCalculator.calculate(events);
    assert.equal(m.totalDetected, intents.length);
    assert.equal(m.byIntent.length, intents.length);
  });
});

// ─── 6. ValidationMetrics ────────────────────────────────────────────────────

describe('ValidationMetricsCalculator', () => {
  it('counts passed and failed', () => {
    const events: AnalyticsEvent[] = [
      ev('validation_passed', 'c1'),
      ev('validation_passed', 'c2'),
      ev('validation_failed', 'c3', { validator: 'MemoryValidator' }),
    ];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.passed, 2);
    assert.equal(m.failed, 1);
    assert.equal(m.totalChecked, 3);
  });

  it('failRate = 33.3 for 1 failure out of 3', () => {
    const events: AnalyticsEvent[] = [
      ev('validation_passed', 'c1'),
      ev('validation_passed', 'c2'),
      ev('validation_failed', 'c3', {}),
    ];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.ok(m.failRate > 33 && m.failRate < 34);
  });

  it('counts fallbacksUsed', () => {
    const events: AnalyticsEvent[] = [ev('fallback_used', 'c1'), ev('fallback_used', 'c2')];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.falllbacksUsed, 2);
  });

  it('counts hallucinationsPrevented', () => {
    const events: AnalyticsEvent[] = [ev('hallucination_prevented', 'c1')];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.hallucinationsPrevented, 1);
  });

  it('counts repetitionsBlocked', () => {
    const events: AnalyticsEvent[] = [ev('repetition_blocked', 'c1'), ev('repetition_blocked', 'c2')];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.repetitionsBlocked, 2);
  });

  it('failsByValidator groups by validator name', () => {
    const events: AnalyticsEvent[] = [
      ev('validation_failed', 'c1', { validator: 'MemoryValidator' }),
      ev('validation_failed', 'c2', { validator: 'MemoryValidator' }),
      ev('validation_failed', 'c3', { validator: 'HallucinationValidator' }),
    ];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.failsByValidator['MemoryValidator'], 2);
    assert.equal(m.failsByValidator['HallucinationValidator'], 1);
  });
});

// ─── 7. MemoryMetrics ────────────────────────────────────────────────────────

describe('MemoryMetricsCalculator', () => {
  it('avgFieldsCollected counts per conversation', () => {
    const events: AnalyticsEvent[] = [
      ev('field_collected', 'c1', { field: 'visitorName', confidence: 90 }),
      ev('field_collected', 'c1', { field: 'phone', confidence: 90 }),
      ev('field_collected', 'c2', { field: 'visitorName', confidence: 90 }),
    ];
    const m = MemoryMetricsCalculator.calculate(events);
    assert.equal(m.avgFieldsCollected, 1.5);
  });

  it('completionRate: conversations with name+phone+service', () => {
    const events: AnalyticsEvent[] = [
      ev('field_collected', 'c1', { field: 'visitorName', confidence: 90 }),
      ev('field_collected', 'c1', { field: 'phone', confidence: 90 }),
      ev('field_collected', 'c1', { field: 'service', confidence: 90 }),
      ev('field_collected', 'c2', { field: 'visitorName', confidence: 90 }),
    ];
    const m = MemoryMetricsCalculator.calculate(events);
    assert.equal(m.completionRate, 50);
  });

  it('lowConfidenceRate: fields with confidence < 50', () => {
    const events: AnalyticsEvent[] = [
      ev('field_collected', 'c1', { field: 'visitorName', confidence: 30 }),
      ev('field_collected', 'c1', { field: 'phone', confidence: 90 }),
    ];
    const m = MemoryMetricsCalculator.calculate(events);
    assert.equal(m.lowConfidenceRate, 50);
  });

  it('fieldCoverage tracks individual field percentages', () => {
    const events: AnalyticsEvent[] = [
      ev('field_collected', 'c1', { field: 'visitorName', confidence: 90 }),
      ev('field_collected', 'c2', { field: 'visitorName', confidence: 90 }),
      ev('field_collected', 'c1', { field: 'phone', confidence: 90 }),
    ];
    const m = MemoryMetricsCalculator.calculate(events);
    assert.equal(m.fieldCoverage['visitorName'], 100);
    assert.equal(m.fieldCoverage['phone'], 50);
  });
});

// ─── 8. HandoffMetrics ───────────────────────────────────────────────────────

describe('HandoffMetricsCalculator', () => {
  it('counts total, humanRequests, complaints', () => {
    const events: AnalyticsEvent[] = [
      ev('handoff_requested', 'c1', { reason: 'customer_requested_human', destination: 'customer_support' }),
      ev('human_requested',   'c1'),
      ev('handoff_requested', 'c2', { reason: 'complaint_detected', destination: 'manager' }),
      ev('complaint_detected','c2'),
    ];
    const m = HandoffMetricsCalculator.calculate(events, 10);
    assert.equal(m.total, 2);
    assert.equal(m.humanRequests, 1);
    assert.equal(m.complaints, 1);
  });

  it('handoffRate = handoffs/conversations × 100', () => {
    const events: AnalyticsEvent[] = [ev('handoff_requested', 'c1', {})];
    const m = HandoffMetricsCalculator.calculate(events, 10);
    assert.equal(m.handoffRate, 10);
  });

  it('byReason groups escalation reasons', () => {
    const events: AnalyticsEvent[] = [
      ev('handoff_requested', 'c1', { reason: 'billing_question' }),
      ev('handoff_requested', 'c2', { reason: 'billing_question' }),
      ev('handoff_requested', 'c3', { reason: 'low_ai_confidence' }),
    ];
    const m = HandoffMetricsCalculator.calculate(events, 10);
    assert.equal(m.byReason['billing_question'], 2);
    assert.equal(m.byReason['low_ai_confidence'], 1);
    assert.equal(m.billingEscalations, 2);
  });

  it('emergencyEscalations counted correctly', () => {
    const events: AnalyticsEvent[] = [
      ev('handoff_requested', 'c1', { reason: 'emergency_escalation', destination: 'dispatcher' }),
    ];
    const m = HandoffMetricsCalculator.calculate(events, 5);
    assert.equal(m.emergencyEscalations, 1);
    assert.equal(m.byDestination['dispatcher'], 1);
  });
});

// ─── 9. FunnelAnalyzer ───────────────────────────────────────────────────────

describe('FunnelAnalyzer', () => {
  it('visitor → greeting stage counts', () => {
    const events = [...happyPath('c1'), ...happyPath('c2', 1000)];
    const f = FunnelAnalyzer.analyze(events, 10);
    const visitor = f.stages.find(s => s.stage === 'visitor');
    assert.equal(visitor!.entered, 10);
  });

  it('overallRate = completed / visitors', () => {
    const events = [...happyPath('c1'), ...abandonedPath('c2')];
    const f = FunnelAnalyzer.analyze(events, 2);
    assert.equal(f.overallRate, 50);
  });

  it('biggestDropoff is the stage with highest abandon rate', () => {
    const events = [
      ...happyPath('c1'),
      ...abandonedPath('c2', 'discovery'),
      ...abandonedPath('c3', 'discovery'),
      ...abandonedPath('c4', 'discovery'),
    ];
    const f = FunnelAnalyzer.analyze(events, 5);
    assert.ok(f.biggestDropoff !== null);
  });

  it('funnel stages are in order', () => {
    const f = FunnelAnalyzer.analyze(happyPath('c1'), 1);
    const stageNames = f.stages.map(s => s.stage);
    assert.ok(stageNames[0] === 'visitor');
    assert.ok(stageNames.includes('booking'));
    assert.ok(stageNames.includes('completed'));
  });

  it('conversionRate is 0 for stages with no entries', () => {
    const f = FunnelAnalyzer.analyze([], 0);
    f.stages.forEach(s => assert.equal(s.conversionRate, 0));
  });

  it('stage conversion: discovery→booking', () => {
    const events = [
      ...happyPath('c1'),       // goes all the way to booking
      ...abandonedPath('c2', 'discovery'),  // stops at discovery
    ];
    const f = FunnelAnalyzer.analyze(events, 2);
    const booking = f.stages.find(s => s.stage === 'booking');
    assert.ok(booking!.entered > 0);
  });
});

// ─── 10. DropoffAnalyzer ─────────────────────────────────────────────────────

describe('DropoffAnalyzer', () => {
  it('identifies top dropoff stage', () => {
    const events = [
      ...abandonedPath('c1', 'discovery'),
      ...abandonedPath('c2', 'discovery'),
      ...abandonedPath('c3', 'qualification'),
    ];
    const r = DropoffAnalyzer.analyze(events);
    assert.equal(r.topDropoffStage, 'discovery');
    assert.equal(r.byStage['discovery'], 2);
    assert.equal(r.byStage['qualification'], 1);
  });

  it('beforeIntent counts conversations abandoned before intent detected', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started',   'c1'),
      ev('conversation_abandoned', 'c1'),   // no intent_detected
    ];
    const r = DropoffAnalyzer.analyze(events);
    assert.equal(r.beforeIntent, 1);
  });

  it('duringBooking counts conversations abandoned in booking stage', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started',   'c1'),
      ev('intent_detected',        'c1', { intent: 'repair' }),
      ev('stage_transition',       'c1', { from: 'discovery', to: 'booking' }),
      ev('conversation_abandoned', 'c1'),
    ];
    const r = DropoffAnalyzer.analyze(events);
    assert.equal(r.duringBooking, 1);
  });

  it('empty events returns null topDropoffStage', () => {
    const r = DropoffAnalyzer.analyze([]);
    assert.equal(r.topDropoffStage, null);
    assert.equal(r.beforeIntent, 0);
  });
});

// ─── 11. PerformanceAnalyzer ─────────────────────────────────────────────────

describe('PerformanceAnalyzer', () => {
  it('computes p50 and p95 per label', () => {
    const events: AnalyticsEvent[] = [
      ev('response_generated', 'c1', { durationMs: 100 }),
      ev('response_generated', 'c2', { durationMs: 200 }),
      ev('response_generated', 'c3', { durationMs: 300 }),
      ev('response_generated', 'c4', { durationMs: 400 }),
      ev('response_generated', 'c5', { durationMs: 500 }),
    ];
    const p = PerformanceAnalyzer.analyze(events);
    assert.ok(p.overall.p50Ms > 0);
    assert.ok(p.overall.p95Ms >= p.overall.p50Ms);
    assert.equal(p.overall.samples, 5);
  });

  it('buckets events by label type', () => {
    const events: AnalyticsEvent[] = [
      ev('response_generated', 'c1', { durationMs: 50 }),
      ev('booking_confirmed',  'c2', { durationMs: 300 }),
    ];
    const p = PerformanceAnalyzer.analyze(events);
    assert.ok(p.buckets.length >= 2);
  });

  it('skips events with 0 or missing durationMs', () => {
    const events: AnalyticsEvent[] = [
      ev('response_generated', 'c1', {}),
      ev('response_generated', 'c2', { durationMs: 0 }),
    ];
    const p = PerformanceAnalyzer.analyze(events);
    assert.equal(p.overall.samples, 0);
  });

  it('overall p50 < 5ms target met for fast events', () => {
    const events: AnalyticsEvent[] = Array.from({ length: 10 }, (_, i) =>
      ev('response_generated', `c${i}`, { durationMs: i + 1 })
    );
    const p = PerformanceAnalyzer.analyze(events);
    assert.ok(p.overall.p50Ms <= 10);
  });
});

// ─── 12. DashboardSnapshot ───────────────────────────────────────────────────

describe('DashboardSnapshotBuilder', () => {
  it('today snapshot includes bookings', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1', {}, 0),
      ev('booking_confirmed',    'c1', {}, 1000),
    ];
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events, nowMs: NOW });
    assert.equal(snap.today.bookings, 1);
    assert.equal(snap.today.conversations, 1);
  });

  it('bookingRate = bookings/conversations × 100', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1', {}, 0),
      ev('conversation_started', 'c2', {}, 0),
      ev('booking_confirmed',    'c1', {}, 1000),
    ];
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events, nowMs: NOW });
    assert.equal(snap.today.bookingRate, 50);
  });

  it('thisWeek contains today events', () => {
    const events: AnalyticsEvent[] = [ev('conversation_started', 'c1', {}, 0)];
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events, nowMs: NOW });
    assert.equal(snap.thisWeek.conversations, 1);
  });

  it('thisMonth contains thisWeek events', () => {
    const events: AnalyticsEvent[] = [ev('conversation_started', 'c1', {}, 0)];
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events, nowMs: NOW });
    assert.equal(snap.thisMonth.conversations, 1);
  });

  it('generatedAt is the injected nowMs', () => {
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events: [], nowMs: NOW });
    assert.equal(snap.generatedAt, new Date(NOW).toISOString());
  });

  it('old events (>30 days) not in thisMonth', () => {
    const oldEvent = { ...ev('conversation_started', 'c-old'), occurredAt: new Date(NOW - 31 * 86400_000).toISOString() };
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events: [oldEvent], nowMs: NOW });
    assert.equal(snap.thisMonth.conversations, 0);
  });

  it('snapshot shape is correct', () => {
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events: [], nowMs: NOW });
    assert.ok('today' in snap);
    assert.ok('thisWeek' in snap);
    assert.ok('thisMonth' in snap);
    assert.ok('bookingRate' in snap.today);
    assert.ok('handoffRate' in snap.today);
  });

  it('handoffs counted in today snapshot', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1', {}, 0),
      ev('handoff_requested',    'c1', {}, 1000),
    ];
    const snap = DashboardSnapshotBuilder.build({ organizationId: ORG, events, nowMs: NOW });
    assert.equal(snap.today.handoffs, 1);
  });
});

// ─── 13. AnalyticsReport ─────────────────────────────────────────────────────

describe('AnalyticsReportBuilder', () => {
  it('daily report filters to last 24h', () => {
    const recent = ev('conversation_started', 'c1', {}, 0);
    const old    = { ...ev('conversation_started', 'c-old'), occurredAt: new Date(NOW - 2 * 86400_000).toISOString() };
    const report = AnalyticsReportBuilder.daily(ORG, [recent, old], NOW);
    assert.equal(report.period, 'daily');
    assert.equal(report.conversations.total, 1);
  });

  it('weekly report spans 7 days', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...ev('conversation_started', `c${i}`),
      occurredAt: new Date(NOW - i * 86400_000).toISOString(),
    }));
    const report = AnalyticsReportBuilder.weekly(ORG, events, NOW);
    assert.equal(report.period, 'weekly');
    assert.equal(report.conversations.total, 5);
  });

  it('monthly report spans 30 days', () => {
    const report = AnalyticsReportBuilder.monthly(ORG, [...happyPath('c1'), ...happyPath('c2', 1000)], NOW);
    assert.equal(report.period, 'monthly');
    assert.ok(report.conversations.total >= 2);
  });

  it('report has all required metric domains', () => {
    const report = AnalyticsReportBuilder.daily(ORG, happyPath('c1'), NOW);
    assert.ok('conversations' in report);
    assert.ok('intents' in report);
    assert.ok('bookings' in report);
    assert.ok('validations' in report);
    assert.ok('memory' in report);
    assert.ok('handoffs' in report);
    assert.ok('funnel' in report);
    assert.ok('performance' in report);
  });

  it('report.generatedAt is a valid ISO string', () => {
    const report = AnalyticsReportBuilder.daily(ORG, [], NOW);
    assert.ok(!isNaN(Date.parse(report.generatedAt)));
  });

  it('report is deterministic: same events → same numbers', () => {
    const events = happyPath('c1');
    const r1 = AnalyticsReportBuilder.daily(ORG, events, NOW);
    const r2 = AnalyticsReportBuilder.daily(ORG, events, NOW);
    assert.equal(r1.conversations.total, r2.conversations.total);
    assert.equal(r1.bookings.confirmed, r2.bookings.confirmed);
  });
});

// ─── 14. AnalyticsEngine (public API) ────────────────────────────────────────

describe('AnalyticsEngine', () => {
  beforeEach(() => AnalyticsEngine.reset(ORG));

  it('track() accepts valid event', () => {
    const ok = AnalyticsEngine.track(ev('conversation_started', 'c1'));
    assert.equal(ok, true);
    assert.equal(AnalyticsEngine.count(ORG), 1);
  });

  it('track() rejects invalid event', () => {
    const ok = AnalyticsEngine.track({ type: 'not_real' as any, organizationId: ORG, conversationId: 'c1' });
    assert.equal(ok, false);
    assert.equal(AnalyticsEngine.count(ORG), 0);
  });

  it('trackBatch() returns count of accepted events', () => {
    const n = AnalyticsEngine.trackBatch([
      ev('conversation_started', 'c1'),
      { type: 'invalid' as any, organizationId: ORG, conversationId: 'c2' },
      ev('booking_confirmed', 'c3'),
    ]);
    assert.equal(n, 2);
    assert.equal(AnalyticsEngine.count(ORG), 2);
  });

  it('dashboard() returns snapshot', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    const snap = AnalyticsEngine.dashboard(ORG, NOW);
    assert.equal(snap.organizationId, ORG);
    assert.ok('today' in snap);
  });

  it('report() returns full report', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    const r = AnalyticsEngine.report(ORG, 'daily', NOW);
    assert.equal(r.period, 'daily');
    assert.ok(r.conversations.total >= 1);
  });

  it('daily() shorthand works', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    const r = AnalyticsEngine.daily(ORG, NOW);
    assert.equal(r.period, 'daily');
  });

  it('weekly() shorthand works', () => {
    const r = AnalyticsEngine.weekly(ORG, NOW);
    assert.equal(r.period, 'weekly');
  });

  it('monthly() shorthand works', () => {
    const r = AnalyticsEngine.monthly(ORG, NOW);
    assert.equal(r.period, 'monthly');
  });

  it('validate() returns valid=true for good event', () => {
    const r = AnalyticsEngine.validate(ev('conversation_started', 'c1'));
    assert.equal(r.valid, true);
  });

  it('validate() returns valid=false for bad event', () => {
    const r = AnalyticsEngine.validate({ type: 'bad' as any });
    assert.equal(r.valid, false);
    assert.ok(r.reason !== undefined);
  });

  it('reset() clears all events for org', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    AnalyticsEngine.reset(ORG);
    assert.equal(AnalyticsEngine.count(ORG), 0);
  });
});

// ─── 15. Integration — full event-to-dashboard pipeline ──────────────────────

describe('Integration — full event-to-dashboard pipeline', () => {
  beforeEach(() => AnalyticsEngine.reset());

  it('happy path: events tracked → report has correct booking conversion', () => {
    for (const e of happyPath('c1')) AnalyticsEngine.track(e);
    for (const e of happyPath('c2', 1000)) AnalyticsEngine.track(e);
    for (const e of abandonedPath('c3')) AnalyticsEngine.track(e);

    const report = AnalyticsEngine.daily(ORG, NOW);
    assert.equal(report.bookings.confirmed, 2);
    assert.equal(report.bookings.attempts, 2);
    assert.equal(report.bookings.conversionRate, 100);
    assert.equal(report.conversations.completed, 2);
    assert.equal(report.conversations.abandoned, 1);
  });

  it('intent conversion tracked end-to-end', () => {
    for (const e of happyPath('c1')) AnalyticsEngine.track(e);   // repair intent
    const report = AnalyticsEngine.daily(ORG, NOW);
    const repairEntry = report.intents.byIntent.find(i => i.intent === 'repair');
    assert.ok(repairEntry !== undefined);
    assert.equal(repairEntry!.conversions, 1);
    assert.equal(repairEntry!.conversionRate, 100);
  });

  it('validation failures tracked in report', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    AnalyticsEngine.track(ev('validation_failed', 'c1', { validator: 'HallucinationValidator' }));
    AnalyticsEngine.track(ev('hallucination_prevented', 'c1'));
    AnalyticsEngine.track(ev('fallback_used', 'c1'));
    const report = AnalyticsEngine.daily(ORG, NOW);
    assert.equal(report.validations.failed, 1);
    assert.equal(report.validations.hallucinationsPrevented, 1);
    assert.equal(report.validations.falllbacksUsed, 1);
  });

  it('handoff metrics flow to report', () => {
    AnalyticsEngine.track(ev('conversation_started', 'c1'));
    AnalyticsEngine.track(ev('handoff_requested', 'c1', { reason: 'complaint_detected', destination: 'manager' }));
    AnalyticsEngine.track(ev('complaint_detected', 'c1'));
    const report = AnalyticsEngine.daily(ORG, NOW);
    assert.equal(report.handoffs.total, 1);
    assert.equal(report.handoffs.complaints, 1);
  });

  it('memory field collection flows to report', () => {
    AnalyticsEngine.track(ev('field_collected', 'c1', { field: 'visitorName', confidence: 90 }));
    AnalyticsEngine.track(ev('field_collected', 'c1', { field: 'phone', confidence: 85 }));
    AnalyticsEngine.track(ev('field_collected', 'c1', { field: 'service', confidence: 80 }));
    const report = AnalyticsEngine.daily(ORG, NOW);
    assert.equal(report.memory.avgFieldsCollected, 3);
    assert.equal(report.memory.completionRate, 100);
  });

  it('dashboard today counts update as events are tracked', () => {
    const snap1 = AnalyticsEngine.dashboard(ORG, NOW);
    assert.equal(snap1.today.bookings, 0);

    for (const e of happyPath('c1')) AnalyticsEngine.track(e);
    const snap2 = AnalyticsEngine.dashboard(ORG, NOW);
    assert.equal(snap2.today.bookings, 1);
  });

  it('multiple orgs are isolated', () => {
    AnalyticsEngine.track({ ...ev('conversation_started', 'c1'), organizationId: 'org-A' });
    AnalyticsEngine.track({ ...ev('conversation_started', 'c2'), organizationId: 'org-B' });
    assert.equal(AnalyticsEngine.count('org-A'), 1);
    assert.equal(AnalyticsEngine.count('org-B'), 1);
    AnalyticsEngine.reset('org-A');
    assert.equal(AnalyticsEngine.count('org-A'), 0);
    assert.equal(AnalyticsEngine.count('org-B'), 1);
  });

  it('funnel shows correct stage progression', () => {
    for (const e of happyPath('c1')) AnalyticsEngine.track(e);
    const report = AnalyticsEngine.daily(ORG, NOW);
    const bookingStage = report.funnel.stages.find(s => s.stage === 'booking');
    assert.ok(bookingStage !== undefined);
    assert.ok(bookingStage!.entered > 0);
  });

  it('performance metrics captured from events with durationMs', () => {
    AnalyticsEngine.track(ev('response_generated', 'c1', { durationMs: 8 }));
    AnalyticsEngine.track(ev('response_generated', 'c2', { durationMs: 12 }));
    const report = AnalyticsEngine.daily(ORG, NOW);
    assert.ok(report.performance.overall.p50Ms > 0);
    assert.ok(report.performance.overall.samples >= 2);
  });
});

// ─── 16. EventAggregator ─────────────────────────────────────────────────────

describe('EventAggregator', () => {
  it('aggregate returns all metric domains', () => {
    const r = EventAggregator.aggregate({
      organizationId: ORG, events: happyPath('c1'),
      period: 'daily', from: '2026-08-04', to: '2026-08-04',
    });
    assert.ok('conversations' in r);
    assert.ok('bookings' in r);
    assert.ok('intents' in r);
    assert.ok('validations' in r);
    assert.ok('memory' in r);
    assert.ok('handoffs' in r);
    assert.ok('funnel' in r);
    assert.ok('performance' in r);
  });

  it('aggregate is deterministic given same events', () => {
    const events = happyPath('c1');
    const r1 = EventAggregator.aggregate({ organizationId: ORG, events, period: 'daily', from: '2026-08-04', to: '2026-08-04' });
    const r2 = EventAggregator.aggregate({ organizationId: ORG, events, period: 'daily', from: '2026-08-04', to: '2026-08-04' });
    assert.equal(r1.bookings.confirmed, r2.bookings.confirmed);
    assert.equal(r1.conversations.total, r2.conversations.total);
  });

  it('aggregate with empty events returns zeros', () => {
    const r = EventAggregator.aggregate({ organizationId: ORG, events: [], period: 'daily', from: '2026-08-04', to: '2026-08-04' });
    assert.equal(r.conversations.total, 0);
    assert.equal(r.bookings.confirmed, 0);
  });
});

// ─── 17. AnalyticsCoordinator ────────────────────────────────────────────────

describe('AnalyticsCoordinator', () => {
  beforeEach(() => AnalyticsCoordinator.reset());

  it('ingest returns true for valid event', () => {
    const ok = AnalyticsCoordinator.ingest(ev('conversation_started', 'c1'));
    assert.equal(ok, true);
  });

  it('ingest returns false for invalid event', () => {
    const ok = AnalyticsCoordinator.ingest({ type: 'bad' as any, organizationId: ORG, conversationId: 'c1' });
    assert.equal(ok, false);
  });

  it('ingestBatch returns accepted count', () => {
    const n = AnalyticsCoordinator.ingestBatch([
      ev('conversation_started', 'c1'),
      ev('booking_confirmed', 'c2'),
      { type: 'bad' as any, organizationId: ORG, conversationId: 'c3' },
    ]);
    assert.equal(n, 2);
  });

  it('getEvents returns stored events for org', () => {
    AnalyticsCoordinator.ingest(ev('conversation_started', 'c1'));
    const events = AnalyticsCoordinator.getEvents(ORG);
    assert.equal(events.length, 1);
  });

  it('reset(orgId) clears only that org', () => {
    AnalyticsCoordinator.ingest({ ...ev('conversation_started', 'c1'), organizationId: 'org-A' });
    AnalyticsCoordinator.ingest({ ...ev('conversation_started', 'c2'), organizationId: 'org-B' });
    AnalyticsCoordinator.reset('org-A');
    assert.equal(AnalyticsCoordinator.count('org-A'), 0);
    assert.equal(AnalyticsCoordinator.count('org-B'), 1);
  });

  it('count returns event count for org', () => {
    AnalyticsCoordinator.ingest(ev('conversation_started', 'c1'));
    AnalyticsCoordinator.ingest(ev('booking_confirmed', 'c1'));
    assert.equal(AnalyticsCoordinator.count(ORG), 2);
  });

  it('dashboard returns snapshot', () => {
    AnalyticsCoordinator.ingest(ev('conversation_started', 'c1'));
    const snap = AnalyticsCoordinator.dashboard(ORG, NOW);
    assert.ok(snap.today !== undefined);
  });

  it('report returns AnalyticsReport', () => {
    AnalyticsCoordinator.ingest(ev('conversation_started', 'c1'));
    const r = AnalyticsCoordinator.report(ORG, 'daily', NOW);
    assert.equal(r.period, 'daily');
  });
});

// ─── 18. Additional edge cases ────────────────────────────────────────────────

describe('BookingMetrics — edge cases', () => {
  it('zero bookings returns null topFailureReason', () => {
    const m = BookingMetricsCalculator.calculate([]);
    assert.equal(m.topFailureReason, null);
    assert.equal(m.attempts, 0);
    assert.equal(m.conversionRate, 0);
  });

  it('all confirmed = 100% conversion rate', () => {
    const events: AnalyticsEvent[] = [
      ev('booking_requested', 'c1'),
      ev('booking_confirmed', 'c1'),
      ev('booking_requested', 'c2'),
      ev('booking_confirmed', 'c2'),
    ];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(m.conversionRate, 100);
  });

  it('multiple failure codes tracked separately', () => {
    const events: AnalyticsEvent[] = [
      ev('booking_failed', 'c1', { errorCode: 'MISSING_PHONE' }),
      ev('booking_failed', 'c2', { errorCode: 'SLOT_IN_PAST' }),
      ev('booking_failed', 'c3', { errorCode: 'MISSING_PHONE' }),
    ];
    const m = BookingMetricsCalculator.calculate(events);
    assert.equal(Object.keys(m.failuresByReason).length, 2);
  });
});

describe('ConversationMetrics — edge cases', () => {
  it('handles single completed conversation', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1'),
      ev('conversation_completed', 'c1', {}, 5000),
    ];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.completed, 1);
    assert.equal(m.abandoned, 0);
    assert.equal(m.completionRate, 100);
  });

  it('p50 equals p95 for single duration', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1'),
      ev('conversation_completed', 'c1', {}, 3000),
    ];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.equal(m.p50DurationMs, m.p95DurationMs);
  });

  it('abandonmentRate + completionRate ≈ 100 when total = started', () => {
    const events: AnalyticsEvent[] = [
      ev('conversation_started', 'c1'),
      ev('conversation_completed', 'c1', {}, 5000),
      ev('conversation_started', 'c2'),
      ev('conversation_abandoned', 'c2', {}, 3000),
    ];
    const m = ConversationMetricsCalculator.calculate(events);
    assert.ok(m.completionRate + m.abandonmentRate <= 100.1);
  });
});

describe('ValidationMetrics — edge cases', () => {
  it('0 validations returns 0 failRate', () => {
    const m = ValidationMetricsCalculator.calculate([]);
    assert.equal(m.failRate, 0);
    assert.equal(m.totalChecked, 0);
  });

  it('100% pass rate', () => {
    const events: AnalyticsEvent[] = [
      ev('validation_passed', 'c1'),
      ev('validation_passed', 'c2'),
      ev('validation_passed', 'c3'),
    ];
    const m = ValidationMetricsCalculator.calculate(events);
    assert.equal(m.failRate, 0);
    assert.equal(m.passed, 3);
  });
});

describe('HandoffMetrics — edge cases', () => {
  it('0 handoffs = 0 handoffRate', () => {
    const m = HandoffMetricsCalculator.calculate([], 10);
    assert.equal(m.handoffRate, 0);
    assert.equal(m.total, 0);
  });

  it('confidence escalations counted', () => {
    const events: AnalyticsEvent[] = [
      ev('ai_confidence_low', 'c1'),
      ev('ai_confidence_low', 'c2'),
    ];
    const m = HandoffMetricsCalculator.calculate(events, 10);
    assert.equal(m.confidenceEscalations, 2);
  });
});

describe('FunnelAnalyzer — edge cases', () => {
  it('0 visitors returns 0 overall rate', () => {
    const f = FunnelAnalyzer.analyze([], 0);
    assert.equal(f.overallRate, 0);
    assert.equal(f.biggestDropoff, null);
  });

  it('all stages present in output', () => {
    const f = FunnelAnalyzer.analyze(happyPath('c1'), 1);
    const stageNames = f.stages.map(s => s.stage);
    assert.ok(stageNames.includes('visitor'));
    assert.ok(stageNames.includes('greeting'));
    assert.ok(stageNames.includes('booking'));
    assert.ok(stageNames.includes('completed'));
  });
});

describe('DropoffAnalyzer — edge cases', () => {
  it('completed conversations not counted as dropoffs', () => {
    const events = happyPath('c1');
    const r = DropoffAnalyzer.analyze(events);
    assert.equal(r.beforeIntent, 0);
  });

  it('multiple stages tracked independently', () => {
    const events = [
      ...abandonedPath('c1', 'discovery'),
      ...abandonedPath('c2', 'qualification'),
      ...abandonedPath('c3', 'qualification'),
    ];
    const r = DropoffAnalyzer.analyze(events);
    assert.equal(r.byStage['discovery'], 1);
    assert.equal(r.byStage['qualification'], 2);
    assert.equal(r.topDropoffStage, 'qualification');
  });
});

describe('PerformanceAnalyzer — edge cases', () => {
  it('single event: p50 = p95 = that value', () => {
    const events: AnalyticsEvent[] = [ev('response_generated', 'c1', { durationMs: 42 })];
    const p = PerformanceAnalyzer.analyze(events);
    assert.equal(p.overall.p50Ms, 42);
    assert.equal(p.overall.p95Ms, 42);
  });

  it('overall samples count is correct', () => {
    const events: AnalyticsEvent[] = Array.from({ length: 10 }, (_, i) =>
      ev('response_generated', `c${i}`, { durationMs: i * 10 + 10 })
    );
    const p = PerformanceAnalyzer.analyze(events);
    assert.equal(p.overall.samples, 10);
  });
});

describe('MetricsCalculator — edge cases', () => {
  it('pct with 100/100 = 100', () => assert.equal(MetricsCalculator.pct(100, 100), 100));
  it('pct rounds to 1dp correctly', () => assert.equal(MetricsCalculator.pct(1, 3), 33.3));
  it('sortedInsert maintains order', () => {
    const arr = MetricsCalculator.sortedInsert([1, 3, 5], 2);
    assert.deepEqual(arr, [1, 2, 3, 5]);
  });
  it('topN with empty map returns empty', () => {
    assert.deepEqual(MetricsCalculator.topN({}, 3), []);
  });
  it('avg of [0] = 0', () => assert.equal(MetricsCalculator.avg([0]), 0));
  it('avg of [1.5, 2.5] = 2', () => assert.equal(MetricsCalculator.avg([1.5, 2.5]), 2));
});
