/**
 * handoff-engine/__tests__/handoff-engine.test.ts
 *
 * Layer 9 — Human Handoff Engine Test Suite
 * 100+ deterministic unit tests. No DB. No Gemini. No network.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { EscalationDetector }      from '../EscalationDetector';
import { ConfidenceEvaluator }      from '../ConfidenceEvaluator';
import { HandoffRules, DEFAULT_ROUTING_RULES } from '../HandoffRules';
import { HandoffPolicyEvaluator }   from '../HandoffPolicy';
import { ConversationSummarizer }   from '../ConversationSummarizer';
import { ContextBuilder }           from '../ContextBuilder';
import { HandoffEventBuilder, HandoffEventBus } from '../HandoffEventBuilder';
import { HumanHandoff }             from '../HumanHandoff';
import { HandoffCoordinator }       from '../HandoffCoordinator';
import { HandoffEngine }            from '../HandoffEngine';

import { buildBusinessIdentity }    from '../../business-identity/BusinessIdentityFactory';
import { emptyRichMemory, emptyProgress } from '../../ai/types';

import type { BusinessIdentity } from '../../business-identity/types';
import type { RichConversationMemory, ChatMessage } from '../../ai/types';
import type { EscalationInput, HandoffEvent } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const alwaysOpen  = { isOpen: true,  openTime: '00:00', closeTime: '23:59' };
const alwaysClosed = { isOpen: false, openTime: '09:00', closeTime: '17:00' };
const NOW_MS = new Date('2026-08-04T14:00:00Z').getTime();

function makeIdentity(overrides: Record<string, unknown> = {}): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: 'org-test',
    companyProfile: { businessId: 'org-test', businessName: 'HVAC Pro', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: 'info@hvacpro.com', address: '1 Main St', city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC' },
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    escalationPolicy: { triggers: ['customer_requests_human', 'complaint', 'payment_issue'], confidenceThreshold: 30, escalationMessage: 'Let me connect you with our team.' },
    ...overrides,
  });
}

function makeMemory(overrides: Partial<RichConversationMemory> = {}): RichConversationMemory {
  const m = emptyRichMemory();
  return { ...m, ...overrides };
}

function makeInput(overrides: Partial<EscalationInput> = {}): EscalationInput {
  return {
    organizationId:       'org-test',
    conversationId:       'conv-1',
    memory:               makeMemory(),
    history:              [],
    stage:                'discovery',
    urgency:              'normal',
    intentCategory:       'repair',
    confidenceScore:      75,
    turnCount:            2,
    identity:             makeIdentity(),
    clarificationAttempts:0,
    nowMs:                NOW_MS,
    ...overrides,
  };
}

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return { role, content };
}

// ─── 1. EscalationDetector — customer requested human ────────────────────────

describe('EscalationDetector — customer requested human', () => {
  it('"Can I speak to someone?" → customer_requested_human', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'Can I speak to someone?')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'customer_requested_human');
    assert.equal(r.confidence, 100);
  });

  it('"Transfer me" → customer_requested_human', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'Transfer me please')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'customer_requested_human');
  });

  it('"I want a real person" → customer_requested_human', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I want a real person')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'customer_requested_human');
  });

  it('"I want to talk to a human" → triggers', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I want to talk to a human agent')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'customer_requested_human');
  });

  it('"live agent" → triggers', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I need a live agent')] }));
    assert.equal(r.triggered, true);
  });

  it('intent category human_representative → triggers even without message', () => {
    const r = EscalationDetector.detect(makeInput({ intentCategory: 'human_representative', history: [] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'customer_requested_human');
  });

  it('normal message does not trigger', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'My AC is not cooling')] }));
    assert.equal(r.triggered, false);
  });
});

describe('EscalationDetector — complaint and frustration', () => {
  it('"This isn\'t helping" → complaint_detected', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', "This isn't helping at all")] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'complaint_detected');
  });

  it('"I\'m frustrated" → complaint_detected', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', "I'm frustrated with this")] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'complaint_detected');
  });

  it('"This is ridiculous" → complaint_detected', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'This is ridiculous')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'complaint_detected');
  });

  it('intent category complaint → triggers', () => {
    const r = EscalationDetector.detect(makeInput({ intentCategory: 'complaint', history: [] }));
    assert.equal(r.triggered, true);
  });

  it('"You\'re not understanding me" → frustration_detected', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', "You're not understanding me")] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'frustration_detected');
  });

  it('"I already told you" → frustration_detected', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I already told you my address')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'frustration_detected');
  });
});

describe('EscalationDetector — billing', () => {
  it('"invoice dispute" → billing_question', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I have an invoice dispute')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'billing_question');
  });

  it('"I need a refund" → billing_question', () => {
    const r = EscalationDetector.detect(makeInput({ history: [msg('user', 'I need a refund')] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'billing_question');
  });

  it('intent billing_question → triggers', () => {
    const r = EscalationDetector.detect(makeInput({ intentCategory: 'billing_question', history: [] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'billing_question');
  });

  it('isHumanRequest helper — direct check', () => {
    assert.equal(EscalationDetector.isHumanRequest('Can I speak with a person'), true);
    assert.equal(EscalationDetector.isHumanRequest('My AC is broken'), false);
  });

  it('isComplaint helper — direct check', () => {
    assert.equal(EscalationDetector.isComplaint("This isn't helping"), true);
    assert.equal(EscalationDetector.isComplaint('I want to book'), false);
  });

  it('isBillingRelated helper — direct check', () => {
    assert.equal(EscalationDetector.isBillingRelated('I have a billing issue'), true);
    assert.equal(EscalationDetector.isBillingRelated('When are you available?'), false);
  });
});

describe('EscalationDetector — low confidence', () => {
  it('score below threshold → low_ai_confidence', () => {
    const r = EscalationDetector.detect(makeInput({ confidenceScore: 10, history: [] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'low_ai_confidence');
  });

  it('score at threshold → no trigger', () => {
    const r = EscalationDetector.detect(makeInput({ confidenceScore: 30, history: [] }));
    assert.equal(r.triggered, false);
  });

  it('repeated clarification failure', () => {
    const r = EscalationDetector.detect(makeInput({ clarificationAttempts: 3, history: [] }));
    assert.equal(r.triggered, true);
    assert.equal(r.reason, 'repeated_clarification_failure');
  });
});

// ─── 2. ConfidenceEvaluator ───────────────────────────────────────────────────

describe('ConfidenceEvaluator', () => {
  it('very_high confidence → no escalation', () => {
    const r = ConfidenceEvaluator.evaluate({ rawScore: 95, confidenceLevel: 'very_high', stage: 'discovery', clarificationAttempts: 0, policyThreshold: 30 });
    assert.equal(r.shouldEscalate, false);
  });

  it('score below policy threshold → escalate', () => {
    const r = ConfidenceEvaluator.evaluate({ rawScore: 20, confidenceLevel: 'low', stage: 'discovery', clarificationAttempts: 0, policyThreshold: 30 });
    assert.equal(r.shouldEscalate, true);
    assert.ok(r.reason?.includes('threshold'));
  });

  it('unknown confidence level applies -40 penalty', () => {
    const r = ConfidenceEvaluator.evaluate({ rawScore: 60, confidenceLevel: 'unknown', stage: 'discovery', clarificationAttempts: 0, policyThreshold: 30 });
    // effective = 60 - 40 = 20 < 30 → should escalate
    assert.equal(r.shouldEscalate, true);
  });

  it('clarification attempts exhausted → escalate', () => {
    const r = ConfidenceEvaluator.evaluate({ rawScore: 80, confidenceLevel: 'high', stage: 'discovery', clarificationAttempts: 3, policyThreshold: 30, maxClarificationAttempts: 3 });
    assert.equal(r.shouldEscalate, true);
    assert.ok(r.reason?.includes('exhausted'));
  });

  it('low confidence level → clarificationNeeded=true (not escalate)', () => {
    const r = ConfidenceEvaluator.evaluate({ rawScore: 60, confidenceLevel: 'low', stage: 'greeting', clarificationAttempts: 0, policyThreshold: 30 });
    // greeting threshold is 20, effective = 60 - 20 = 40 >= 30 → no escalate but needs clarification
    assert.equal(r.shouldEscalate, false);
    assert.equal(r.clarificationNeeded, true);
  });

  it('booking stage has higher threshold than greeting', () => {
    const greeting = ConfidenceEvaluator.evaluate({ rawScore: 35, confidenceLevel: 'medium', stage: 'greeting', clarificationAttempts: 0, policyThreshold: 5 });
    const booking  = ConfidenceEvaluator.evaluate({ rawScore: 35, confidenceLevel: 'medium', stage: 'booking',  clarificationAttempts: 0, policyThreshold: 5 });
    // booking requires ≥50, greeting requires ≥20
    assert.ok(!greeting.shouldEscalate || booking.shouldEscalate);
  });

  it('isUnacceptable returns true for unknown level', () => {
    assert.equal(ConfidenceEvaluator.isUnacceptable('unknown'), true);
    assert.equal(ConfidenceEvaluator.isUnacceptable('high'), false);
  });
});

// ─── 3. HandoffRules ─────────────────────────────────────────────────────────

describe('HandoffRules', () => {
  it('finds rule for customer_requested_human', () => {
    const r = HandoffRules.findRule('customer_requested_human');
    assert.ok(r !== null);
    assert.equal(r!.destination, 'customer_support');
    assert.equal(r!.priority, 'high');
  });

  it('emergency_escalation routes to dispatcher with critical priority', () => {
    const r = HandoffRules.findRule('emergency_escalation');
    assert.equal(r!.destination, 'dispatcher');
    assert.equal(r!.priority, 'critical');
  });

  it('legal_issue routes to manager with critical priority', () => {
    const r = HandoffRules.findRule('legal_issue');
    assert.equal(r!.destination, 'manager');
    assert.equal(r!.priority, 'critical');
  });

  it('billing_question routes to billing_department', () => {
    const dest = HandoffRules.resolveDestination('billing_question');
    assert.equal(dest, 'billing_department');
  });

  it('complaint_detected routes to manager', () => {
    const dest = HandoffRules.resolveDestination('complaint_detected');
    assert.equal(dest, 'manager');
  });

  it('unknown reason falls back to default', () => {
    const dest = HandoffRules.resolveDestination('business_rule', [], 'customer_support');
    assert.equal(dest, 'customer_support');
  });

  it('custom rules take precedence over defaults', () => {
    const custom = [{ reason: 'billing_question' as const, destination: 'office_staff' as const, priority: 'high' as const, enabled: true }];
    const dest = HandoffRules.resolveDestination('billing_question', custom, 'customer_support');
    assert.equal(dest, 'office_staff');
  });

  it('disabled rule is skipped', () => {
    const custom = [{ reason: 'billing_question' as const, destination: 'office_staff' as const, priority: 'high' as const, enabled: false }];
    const dest = HandoffRules.resolveDestination('billing_question', custom, 'customer_support');
    // Falls back to default since custom is disabled
    assert.equal(dest, 'billing_department');
  });

  it('defaultPolicy has sensible defaults', () => {
    const policy = HandoffRules.defaultPolicy();
    assert.equal(policy.defaultDestination, 'customer_support');
    assert.ok(policy.rules.length > 0);
    assert.ok(policy.confidenceThreshold > 0);
  });

  it('DEFAULT_ROUTING_RULES covers all expected reasons', () => {
    const reasons = DEFAULT_ROUTING_RULES.map(r => r.reason);
    assert.ok(reasons.includes('customer_requested_human'));
    assert.ok(reasons.includes('emergency_escalation'));
    assert.ok(reasons.includes('billing_question'));
    assert.ok(reasons.includes('complaint_detected'));
  });
});

// ─── 4. HandoffPolicy ────────────────────────────────────────────────────────

describe('HandoffPolicyEvaluator', () => {
  const identity = makeIdentity();

  it('emergency urgency → dispatcher + critical priority', () => {
    const r = HandoffPolicyEvaluator.route('customer_requested_human', HandoffRules.defaultPolicy(), 'critical');
    assert.equal(r.destination, 'dispatcher');
    assert.equal(r.priority, 'critical');
  });

  it('normal urgency → uses routing rule', () => {
    const r = HandoffPolicyEvaluator.route('billing_question', HandoffRules.defaultPolicy(), 'normal');
    assert.equal(r.destination, 'billing_department');
  });

  it('fromIdentity inherits confidence threshold', () => {
    const policy = HandoffPolicyEvaluator.fromIdentity(identity);
    assert.equal(policy.confidenceThreshold, identity.escalationPolicy.confidenceThreshold);
  });

  it('requiresOfficeHoursHandoff=false when business is open', () => {
    const r = HandoffPolicyEvaluator.requiresOfficeHoursHandoff(identity, NOW_MS);
    assert.equal(r, false);
  });

  it('requiresOfficeHoursHandoff=true when business is closed and no after-hours', () => {
    const closedIdentity = makeIdentity({
      businessHours: { monday: alwaysClosed, tuesday: alwaysClosed, wednesday: alwaysClosed, thursday: alwaysClosed, friday: alwaysClosed, saturday: alwaysClosed, sunday: alwaysClosed, emergencyAfterHours: false, vacationMode: false, holidays: [], closedDates: [] },
    });
    const r = HandoffPolicyEvaluator.requiresOfficeHoursHandoff(closedIdentity, NOW_MS);
    assert.equal(r, true);
  });

  it('requiresOfficeHoursHandoff=false when closed but emergencyAfterHours=true', () => {
    const emergIdentity = makeIdentity({
      businessHours: { monday: alwaysClosed, tuesday: alwaysClosed, wednesday: alwaysClosed, thursday: alwaysClosed, friday: alwaysClosed, saturday: alwaysClosed, sunday: alwaysClosed, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    });
    const r = HandoffPolicyEvaluator.requiresOfficeHoursHandoff(emergIdentity, NOW_MS);
    assert.equal(r, false);
  });

  it('bridgeMessage for customer_requested_human includes business name', () => {
    const msg = HandoffPolicyEvaluator.bridgeMessage('customer_requested_human', 'customer_support', identity, 'Alice');
    assert.ok(msg.includes('HVAC Pro') || msg.includes('team'));
    assert.ok(msg.includes('Alice'));
  });

  it('bridgeMessage for billing_question mentions account', () => {
    const msg = HandoffPolicyEvaluator.bridgeMessage('billing_question', 'billing_department', identity, null);
    assert.ok(/billing|account/i.test(msg));
  });

  it('bridgeMessage for emergency mentions urgency', () => {
    const msg = HandoffPolicyEvaluator.bridgeMessage('emergency_escalation', 'dispatcher', identity, null);
    assert.ok(/urgent|immediately|dispatcher/i.test(msg));
  });

  it('bridgeMessage falls back to escalationMessage when no specific message', () => {
    const msg = HandoffPolicyEvaluator.bridgeMessage('business_rule', 'customer_support', identity, null);
    assert.ok(msg.length > 0);
  });
});

// ─── 5. ConversationSummarizer ────────────────────────────────────────────────

describe('ConversationSummarizer — complete conversation', () => {
  it('includes collected name and phone', () => {
    const mem = makeMemory();
    mem.visitorName = 'John Smith';
    mem.phone       = '555-1234';
    Object.assign(mem.progress, { visitorNameCollected: true, phoneCollected: true });
    const summary = ConversationSummarizer.summarize(
      makeInput({ memory: mem }),
      'customer_requested_human',
    );
    assert.equal(summary.customer.name, 'John Smith');
    assert.equal(summary.customer.phone, '555-1234');
    assert.ok(summary.informationCollected.includes('Name'));
    assert.ok(summary.informationCollected.includes('Phone'));
  });

  it('lists missing information correctly', () => {
    const summary = ConversationSummarizer.summarize(makeInput(), 'low_ai_confidence');
    assert.ok(summary.missingInformation.includes('Name'));
    assert.ok(summary.missingInformation.includes('Phone'));
  });

  it('includes service from servicesDiscussed', () => {
    const mem = makeMemory();
    mem.servicesDiscussed = ['AC Repair'];
    const summary = ConversationSummarizer.summarize(makeInput({ memory: mem }), 'complaint_detected');
    assert.equal(summary.service, 'AC Repair');
  });

  it('includes booking status', () => {
    const mem = makeMemory();
    (mem as any).bookingStatus = 'booked';
    const summary = ConversationSummarizer.summarize(makeInput({ memory: mem }), 'booking_completed');
    assert.equal(summary.bookingStatus, 'booked');
  });

  it('includes pain points', () => {
    const mem = makeMemory();
    mem.painPoints = ['AC making noise', 'Not cooling well'];
    const summary = ConversationSummarizer.summarize(makeInput({ memory: mem }), 'customer_requested_human');
    assert.deepEqual([...summary.painPoints], ['AC making noise', 'Not cooling well']);
  });

  it('includes reason and description', () => {
    const summary = ConversationSummarizer.summarize(makeInput(), 'emergency_escalation');
    assert.equal(summary.reasonForHandoff, 'emergency_escalation');
    assert.ok(summary.reasonDescription.length > 0);
  });

  it('generatedAt is a valid ISO timestamp', () => {
    const summary = ConversationSummarizer.summarize(makeInput(), 'low_ai_confidence');
    assert.ok(!isNaN(Date.parse(summary.generatedAt)));
  });

  it('stage and urgency are preserved', () => {
    const summary = ConversationSummarizer.summarize(
      makeInput({ stage: 'booking', urgency: 'critical' }),
      'emergency_escalation',
    );
    assert.equal(summary.conversationStage, 'booking');
    assert.equal(summary.urgency, 'critical');
  });

  it('partial conversation — some fields missing', () => {
    const summary = ConversationSummarizer.summarize(makeInput(), 'low_ai_confidence');
    assert.ok(summary.informationCollected.length === 0);
    assert.ok(summary.missingInformation.length > 0);
  });
});

// ─── 6. ContextBuilder ───────────────────────────────────────────────────────

describe('ContextBuilder', () => {
  it('builds complete agent context', () => {
    const input   = makeInput();
    const summary = ConversationSummarizer.summarize(input, 'customer_requested_human');
    const ctx     = ContextBuilder.build({
      summary, input,
      destination: 'customer_support',
      priority:    'high',
      handoffId:   'hnd-00000001',
    });
    assert.equal(ctx.conversationId, 'conv-1');
    assert.equal(ctx.organizationId, 'org-test');
    assert.equal(ctx.businessName, 'HVAC Pro');
    assert.equal(ctx.priority, 'high');
    assert.equal(ctx.destination, 'customer_support');
    assert.ok(ctx.agentBrief.length > 0);
  });

  it('agentBrief contains customer name when collected', () => {
    const mem = makeMemory();
    mem.visitorName = 'Alice';
    mem.phone       = '555-9999';
    Object.assign(mem.progress, { visitorNameCollected: true, phoneCollected: true });
    const input   = makeInput({ memory: mem });
    const summary = ConversationSummarizer.summarize(input, 'customer_requested_human');
    const ctx     = ContextBuilder.build({ summary, input, destination: 'customer_support', priority: 'high', handoffId: 'hnd-1' });
    assert.ok(ctx.agentBrief.includes('Alice'));
    assert.ok(ctx.agentBrief.includes('555-9999'));
  });

  it('recentHistory contains at most last 10 messages', () => {
    const history = Array.from({ length: 20 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`));
    const input   = makeInput({ history });
    const summary = ConversationSummarizer.summarize(input, 'low_ai_confidence');
    const ctx     = ContextBuilder.build({ summary, input, destination: 'customer_support', priority: 'normal', handoffId: 'hnd-2' });
    assert.ok(ctx.recentHistory.length <= 10);
  });

  it('minimal context builder returns key fields', () => {
    const min = ContextBuilder.minimal({
      conversationId: 'conv-1',
      organizationId: 'org-1',
      businessName:   'HVAC Pro',
      handoffId:      'hnd-min',
      reason:         'Customer requested',
    });
    assert.equal(min.handoffId, 'hnd-min');
    assert.ok(min.agentBrief.includes('Customer requested'));
  });

  it('context is frozen (immutable)', () => {
    const input   = makeInput();
    const summary = ConversationSummarizer.summarize(input, 'customer_requested_human');
    const ctx     = ContextBuilder.build({ summary, input, destination: 'customer_support', priority: 'high', handoffId: 'hnd-3' });
    assert.equal(Object.isFrozen(ctx), true);
  });
});

// ─── 7. HandoffEventBuilder ───────────────────────────────────────────────────

describe('HandoffEventBuilder', () => {
  const BASE = {
    organizationId: 'org-1',
    conversationId: 'conv-1',
    reason:         'customer_requested_human' as const,
    priority:       'high' as const,
    destination:    'customer_support' as const,
    nowMs:          NOW_MS,
  };

  it('build() creates event with correct type', () => {
    const e = HandoffEventBuilder.build({ ...BASE, type: 'handoff_requested' });
    assert.equal(e.type, 'handoff_requested');
    assert.equal(e.reason, 'customer_requested_human');
    assert.equal(e.priority, 'high');
  });

  it('requested() creates handoff_requested event', () => {
    const e = HandoffEventBuilder.requested(BASE);
    assert.equal(e.type, 'handoff_requested');
  });

  it('completed() creates handoff_completed event', () => {
    const e = HandoffEventBuilder.completed(BASE);
    assert.equal(e.type, 'handoff_completed');
  });

  it('cancelled() creates handoff_cancelled event', () => {
    const e = HandoffEventBuilder.cancelled(BASE);
    assert.equal(e.type, 'handoff_cancelled');
  });

  it('humanRequested() creates human_requested event', () => {
    const e = HandoffEventBuilder.humanRequested(BASE);
    assert.equal(e.type, 'human_requested');
  });

  it('confidenceLow() creates ai_confidence_low event', () => {
    const e = HandoffEventBuilder.confidenceLow(BASE);
    assert.equal(e.type, 'ai_confidence_low');
  });

  it('complaintDetected() creates complaint_detected event', () => {
    const e = HandoffEventBuilder.complaintDetected(BASE);
    assert.equal(e.type, 'complaint_detected');
  });

  it('occurredAt is deterministic with nowMs', () => {
    const e = HandoffEventBuilder.build({ ...BASE, type: 'handoff_requested' });
    assert.equal(e.occurredAt, new Date(NOW_MS).toISOString());
  });

  it('event is frozen', () => {
    const e = HandoffEventBuilder.build({ ...BASE, type: 'handoff_requested' });
    assert.equal(Object.isFrozen(e), true);
  });
});

describe('HandoffEventBus', () => {
  beforeEach(() => HandoffEventBus.reset());

  it('emits events to registered handlers', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    const evt = HandoffEventBuilder.requested({
      organizationId: 'o', conversationId: 'c',
      reason: 'customer_requested_human', priority: 'high', destination: 'customer_support',
    });
    HandoffEventBus.emit(evt);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.type, 'handoff_requested');
  });

  it('off() removes handler', () => {
    const events: HandoffEvent[] = [];
    const handler = (e: HandoffEvent) => events.push(e);
    HandoffEventBus.on(handler);
    HandoffEventBus.off(handler);
    HandoffEventBus.emit(HandoffEventBuilder.requested({
      organizationId: 'o', conversationId: 'c',
      reason: 'customer_requested_human', priority: 'high', destination: 'customer_support',
    }));
    assert.equal(events.length, 0);
  });

  it('handler errors do not propagate', () => {
    HandoffEventBus.on(() => { throw new Error('handler error'); });
    const evt = HandoffEventBuilder.requested({
      organizationId: 'o', conversationId: 'c',
      reason: 'customer_requested_human', priority: 'high', destination: 'customer_support',
    });
    assert.doesNotThrow(() => HandoffEventBus.emit(evt));
  });

  it('reset() clears all handlers', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    HandoffEventBus.reset();
    HandoffEventBus.emit(HandoffEventBuilder.requested({
      organizationId: 'o', conversationId: 'c',
      reason: 'customer_requested_human', priority: 'high', destination: 'customer_support',
    }));
    assert.equal(events.length, 0);
  });
});

// ─── 8. HumanHandoff ─────────────────────────────────────────────────────────

describe('HumanHandoff.execute', () => {
  beforeEach(() => HandoffEventBus.reset());

  it('returns shouldHandoff=true with all fields populated', () => {
    const result = HumanHandoff.execute(makeInput(), 'customer_requested_human');
    assert.equal(result.shouldHandoff, true);
    assert.equal(result.reason, 'customer_requested_human');
    assert.ok(result.summary !== undefined);
    assert.ok(result.context !== undefined);
    assert.ok(result.event !== undefined);
    assert.ok(result.bridgeMessage.length > 0);
  });

  it('emits handoff_requested event', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    HumanHandoff.execute(makeInput(), 'customer_requested_human');
    assert.ok(events.some(e => e.type === 'handoff_requested'));
  });

  it('emits human_requested for customer_requested_human reason', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    HumanHandoff.execute(makeInput(), 'customer_requested_human');
    assert.ok(events.some(e => e.type === 'human_requested'));
  });

  it('emits complaint_detected for complaint reason', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    HumanHandoff.execute(makeInput(), 'complaint_detected');
    assert.ok(events.some(e => e.type === 'complaint_detected'));
  });

  it('emits ai_confidence_low for low confidence reason', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));
    HumanHandoff.execute(makeInput(), 'low_ai_confidence');
    assert.ok(events.some(e => e.type === 'ai_confidence_low'));
  });

  it('emergency routes to dispatcher', () => {
    const result = HumanHandoff.execute(makeInput({ urgency: 'critical' }), 'emergency_escalation');
    assert.equal(result.destination, 'dispatcher');
    assert.equal(result.priority, 'critical');
  });

  it('billing routes to billing_department', () => {
    const result = HumanHandoff.execute(makeInput(), 'billing_question');
    assert.equal(result.destination, 'billing_department');
  });

  it('handoffId is deterministic', () => {
    const r1 = HumanHandoff.execute(makeInput({ nowMs: 1000 }), 'low_ai_confidence');
    const r2 = HumanHandoff.execute(makeInput({ nowMs: 1000 }), 'low_ai_confidence');
    assert.equal(r1.context!.handoffId, r2.context!.handoffId);
  });

  it('noHandoff returns shouldHandoff=false', () => {
    const r = HumanHandoff.noHandoff();
    assert.equal(r.shouldHandoff, false);
    assert.equal(r.reason, null);
    assert.equal(r.bridgeMessage, '');
  });
});

// ─── 9. HandoffCoordinator — full pipeline ────────────────────────────────────

describe('HandoffCoordinator — escalation triggers', () => {
  beforeEach(() => HandoffEventBus.reset());

  it('no handoff for normal conversation', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ history: [msg('user', 'When are you available?')] }));
    assert.equal(r.shouldHandoff, false);
  });

  it('customer requests human → handoff', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ history: [msg('user', 'I want to speak to a person')] }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.reason, 'customer_requested_human');
  });

  it('emergency urgency → emergency_escalation', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ urgency: 'critical' }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.reason, 'emergency_escalation');
  });

  it('complaint detected → handoff', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ history: [msg('user', "This isn't helpful at all")] }));
    assert.equal(r.shouldHandoff, true);
  });

  it('low confidence → low_ai_confidence handoff', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ confidenceScore: 5 }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.reason, 'low_ai_confidence');
  });

  it('repeated clarification → repeated_clarification_failure', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ clarificationAttempts: 3 }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.reason, 'repeated_clarification_failure');
  });

  it('office hours only — closed business triggers handoff', () => {
    const closedIdentity = makeIdentity({
      businessHours: { monday: alwaysClosed, tuesday: alwaysClosed, wednesday: alwaysClosed, thursday: alwaysClosed, friday: alwaysClosed, saturday: alwaysClosed, sunday: alwaysClosed, emergencyAfterHours: false, vacationMode: false, holidays: [], closedDates: [] },
    });
    const r = HandoffCoordinator.evaluate(makeInput({ identity: closedIdentity }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.reason, 'office_hours_only');
  });

  it('billing question → handoff to billing_department', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ intentCategory: 'billing_question', history: [] }));
    assert.equal(r.shouldHandoff, true);
    assert.equal(r.destination, 'billing_department');
  });

  it('handoff result contains bridge message', () => {
    const r = HandoffCoordinator.evaluate(makeInput({ history: [msg('user', 'I want a real person')] }));
    assert.ok(r.bridgeMessage.length > 0);
  });
});

describe('HandoffCoordinator — booking_completed policy', () => {
  it('alwaysHandoffAfterBooking=false does not trigger on booking', () => {
    const mem = makeMemory();
    (mem as any).bookingStatus = 'booked';
    const r = HandoffCoordinator.evaluate(makeInput({ memory: mem }));
    // Default policy does NOT auto-handoff after booking
    assert.ok(r.shouldHandoff === false || r.reason !== 'booking_completed');
  });
});

// ─── 10. HandoffEngine (public API) ──────────────────────────────────────────

describe('HandoffEngine', () => {
  beforeEach(() => HandoffEventBus.reset());

  it('evaluate() returns no handoff for clean conversation', () => {
    const r = HandoffEngine.evaluate(makeInput({ history: [msg('user', 'My AC is not working')] }));
    assert.equal(r.shouldHandoff, false);
  });

  it('evaluate() returns handoff for human request', () => {
    const r = HandoffEngine.evaluate(makeInput({ history: [msg('user', 'Transfer me to a human')] }));
    assert.equal(r.shouldHandoff, true);
  });

  it('isEscalationMessage detects human request', () => {
    assert.equal(HandoffEngine.isEscalationMessage('I want to speak to someone'), true);
    assert.equal(HandoffEngine.isEscalationMessage('Book an appointment'), false);
  });

  it('isEscalationMessage detects complaint', () => {
    assert.equal(HandoffEngine.isEscalationMessage("This isn't helpful"), true);
  });

  it('isEmergencyHandoff returns true for critical urgency', () => {
    assert.equal(HandoffEngine.isEmergencyHandoff('critical'), true);
    assert.equal(HandoffEngine.isEmergencyHandoff('emergency'), true);
    assert.equal(HandoffEngine.isEmergencyHandoff('normal'), false);
    assert.equal(HandoffEngine.isEmergencyHandoff('priority'), false);
  });

  it('evaluate() is synchronous (no await needed)', () => {
    const result = HandoffEngine.evaluate(makeInput());
    // If synchronous, result is available immediately
    assert.equal(typeof result.shouldHandoff, 'boolean');
  });

  it('evaluate() p95 target — runs under 15ms', () => {
    const start = Date.now();
    HandoffEngine.evaluate(makeInput({ history: Array.from({ length: 20 }, (_, i) => msg('user', `msg ${i}`)) }));
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 15, `evaluate() took ${elapsed}ms — exceeds 15ms p95 target`);
  });
});

// ─── 11. Integration — AI-to-human lifecycle ─────────────────────────────────

describe('Integration — full handoff lifecycle', () => {
  beforeEach(() => HandoffEventBus.reset());

  it('complete lifecycle: detect → summarize → context → event → bridge', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));

    const mem = makeMemory();
    mem.visitorName = 'John Smith';
    mem.phone       = '555-0001';
    mem.servicesDiscussed = ['AC Repair'];
    Object.assign(mem.progress, { visitorNameCollected: true, phoneCollected: true, serviceCollected: true });

    const input = makeInput({
      memory:  mem,
      history: [
        msg('user',      'Hi, my AC stopped working'),
        msg('assistant', 'I can help with that. What\'s your name?'),
        msg('user',      'John Smith'),
        msg('assistant', 'Can I speak to a real person please?'),
        msg('user',      'I want to talk to a human'),
      ],
    });

    const result = HandoffEngine.evaluate(input);

    assert.equal(result.shouldHandoff, true);
    assert.equal(result.reason, 'customer_requested_human');

    // Summary has customer data
    assert.equal(result.summary!.customer.name, 'John Smith');
    assert.equal(result.summary!.customer.phone, '555-0001');
    assert.equal(result.summary!.service, 'AC Repair');
    assert.ok(result.summary!.informationCollected.includes('Name'));

    // Context has agent brief
    assert.ok(result.context!.agentBrief.includes('John Smith'));

    // Bridge message is ready for customer
    assert.ok(result.bridgeMessage.length > 0);

    // Event was emitted
    assert.ok(events.some(e => e.type === 'handoff_requested'));
    assert.ok(events.some(e => e.type === 'human_requested'));
  });

  it('emergency flow: critical urgency → dispatcher → bridge message', () => {
    const events: HandoffEvent[] = [];
    HandoffEventBus.on(e => events.push(e));

    const result = HandoffEngine.evaluate(makeInput({
      urgency:      'critical',
      intentCategory:'emergency_service',
      history:      [msg('user', 'My furnace is on fire!')],
    }));

    assert.equal(result.shouldHandoff, true);
    assert.equal(result.destination, 'dispatcher');
    assert.equal(result.priority, 'critical');
    assert.ok(result.bridgeMessage.length > 0);
    assert.ok(events.some(e => e.type === 'handoff_requested'));
  });

  it('customer never needs to repeat info — context has all collected fields', () => {
    const mem = makeMemory();
    mem.visitorName = 'Alice';
    mem.phone       = '555-7777';
    mem.email       = 'alice@test.com';
    mem.servicesDiscussed = ['Furnace Repair'];
    Object.assign(mem.progress, {
      visitorNameCollected: true,
      phoneCollected:       true,
      emailCollected:       true,
      serviceCollected:     true,
    });

    const result = HumanHandoff.execute(makeInput({ memory: mem }), 'customer_requested_human');
    const { customer } = result.summary!;

    assert.equal(customer.name,  'Alice');
    assert.equal(customer.phone, '555-7777');
    assert.equal(customer.email, 'alice@test.com');
    assert.equal(result.summary!.service, 'Furnace Repair');
  });
});
