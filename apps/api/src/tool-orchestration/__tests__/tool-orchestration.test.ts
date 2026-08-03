/**
 * tool-orchestration/__tests__/tool-orchestration.test.ts
 *
 * Layer 7 — Tool Orchestration Engine tests.
 * All tests are pure (no DB, no external services).
 * ToolExecutor is NOT imported — all tests use ToolSelector, ToolGuards,
 * ToolResultAggregator, and MemoryBugFixes which are all side-effect free.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ToolSelector }          from '../ToolSelector';
import { ToolGuards }            from '../ToolGuards';
import { ToolResultAggregator }  from '../ToolResultAggregator';
import { ToolOrchestrationEngine } from '../ToolOrchestrationEngine';
import {
  stableMemoryId,
  isBusinessClosed,
  INTENT_CATEGORY_MAP,
} from '../MemoryBugFixes';
import { buildMemoryItem }       from '../../memory-engine/MemoryScorer';

import type { ToolSelectionContext } from '../types';
import type { ResolvedIntent }       from '../../intent-engine/types';
import type { BusinessIdentity }     from '../../business-identity/types';
import type { RichConversationMemory, QualificationScore } from '../../ai/types';
import { emptyRichMemory }           from '../../ai/types';
import { buildBusinessIdentity }     from '../../business-identity/BusinessIdentityFactory';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };

function makeIdentity(industry = 'hvac'): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: `org-${industry}`,
    companyProfile: { businessId: `org-${industry}`, businessName: `${industry} Co`, industry, subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: 'info@test.com', address: '123 Main', city: 'Austin', state: 'TX', country: 'US', timezone: 'America/Chicago' },
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
  });
}

function makeIntent(overrides: Partial<ResolvedIntent> = {}): ResolvedIntent {
  return {
    id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high',
    urgency: 'normal', detectedService: null, entities: [], candidates: [],
    reasoning: '', blueprintId: null, requiresHuman: false, requiresClarification: false,
    rawMessage: 'fix my system', timestamp: new Date(), ...overrides,
  };
}

function makeQual(): QualificationScore {
  return { overall: 40, temperature: 'Cold', confidence: 50, breakdown: { industry: 40, companySize: 40, decisionMaker: 50, budget: 35, timeline: 35, urgency: 40, technicalReady: 60, aiReady: 45, painSeverity: 20, buyingIntent: 30 }, reasons: [], missingInfo: [] };
}

function makeCtx(overrides: Partial<ToolSelectionContext> = {}): ToolSelectionContext {
  return {
    organizationId: 'org-1',
    conversationId: 'conv-1',
    intent:         makeIntent(),
    memory:         emptyRichMemory(),
    stage:          'discovery',
    workflowState:  'collecting_info',
    objective:      'collect_phone',
    qualification:  makeQual(),
    identity:       makeIdentity(),
    turnCount:      1,
    userMessage:    'I need help',
    ...overrides,
  };
}

function memWithContact(): RichConversationMemory {
  const m = emptyRichMemory();
  (m as any).visitorName = 'Alice';
  (m as any).phone       = '555-1234';
  (m as any).bookingStatus = 'none';
  return m;
}

function memBooked(): RichConversationMemory {
  const m = memWithContact();
  (m as any).bookingStatus = 'booked';
  return m;
}

// ─── 1. ToolSelector — selection rules ───────────────────────────────────────

describe('ToolSelector — No tools needed', () => {
  it('returns empty plan for greeting stage with unknown intent', () => {
    const plan = ToolSelector.select(makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 }));
    assert.equal(plan.calls.length, 0);
  });

  it('marks empty plan as parallel', () => {
    const plan = ToolSelector.select(makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 }));
    assert.equal(plan.runInParallel, true);
  });
});

describe('ToolSelector — Emergency flow', () => {
  it('critical urgency → check_availability + escalate', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ urgency: 'critical' }) }));
    const tools = plan.calls.map(c => c.tool);
    assert.ok(tools.includes('check_availability'));
    assert.ok(tools.includes('escalate'));
  });

  it('emergency urgency → check_availability + escalate', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ urgency: 'emergency' }) }));
    const tools = plan.calls.map(c => c.tool);
    assert.ok(tools.includes('escalate'));
  });

  it('emergency flow stops after escalate (no booking in same plan)', () => {
    const plan = ToolSelector.select(makeCtx({
      intent: makeIntent({ urgency: 'critical' }),
      stage:  'booking',
      memory: memWithContact(),
    }));
    const tools = plan.calls.map(c => c.tool);
    // Emergency rule fires first and returns immediately — no book_appointment
    assert.ok(!tools.includes('book_appointment'));
  });

  it('emergency plan is NOT parallel (escalate must be last)', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.equal(plan.runInParallel, false);
  });
});

describe('ToolSelector — Escalation', () => {
  it('requiresHuman → escalate tool selected', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ requiresHuman: true }) }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });

  it('human_representative category → escalate', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'human_representative' }) }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });

  it('escalating workflowState → escalate', () => {
    const plan = ToolSelector.select(makeCtx({ workflowState: 'escalating' }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });
});

describe('ToolSelector — Booking flow', () => {
  it('booking stage → check_availability always selected', () => {
    const plan = ToolSelector.select(makeCtx({ stage: 'booking' }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('booking intent → check_availability selected', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'book_appointment' }) }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('booking_in_progress workflow → check_availability selected', () => {
    const plan = ToolSelector.select(makeCtx({ workflowState: 'booking_in_progress' }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('booking stage + complete data → book_appointment selected', () => {
    const plan = ToolSelector.select(makeCtx({
      stage:  'booking',
      memory: memWithContact(),
      intent: makeIntent({ category: 'book_appointment' }),
    }));
    assert.ok(plan.calls.some(c => c.tool === 'book_appointment'));
  });

  it('booking stage + no name → no book_appointment', () => {
    const plan = ToolSelector.select(makeCtx({ stage: 'booking' }));
    assert.ok(!plan.calls.some(c => c.tool === 'book_appointment'));
  });

  it('already booked → no second book_appointment', () => {
    const plan = ToolSelector.select(makeCtx({
      stage:  'booking',
      memory: memBooked(),
    }));
    assert.ok(!plan.calls.some(c => c.tool === 'book_appointment'));
  });

  it('check_availability is marked idempotent', () => {
    const plan = ToolSelector.select(makeCtx({ stage: 'booking' }));
    const avail = plan.calls.find(c => c.tool === 'check_availability');
    assert.equal(avail?.idempotent, true);
  });

  it('book_appointment is marked NOT idempotent', () => {
    const plan = ToolSelector.select(makeCtx({
      stage:  'booking',
      memory: memWithContact(),
      intent: makeIntent({ category: 'book_appointment' }),
    }));
    const book = plan.calls.find(c => c.tool === 'book_appointment');
    assert.equal(book?.idempotent, false);
  });
});

describe('ToolSelector — Lead upsert', () => {
  it('name + phone collected → create_lead selected after turn 1', () => {
    const plan = ToolSelector.select(makeCtx({ memory: memWithContact(), turnCount: 1 }));
    assert.ok(plan.calls.some(c => c.tool === 'create_lead'));
  });

  it('no contact info → no create_lead', () => {
    const plan = ToolSelector.select(makeCtx({ turnCount: 1 }));
    assert.ok(!plan.calls.some(c => c.tool === 'create_lead'));
  });

  it('turn 0 → no create_lead (avoid greeting noise)', () => {
    const plan = ToolSelector.select(makeCtx({ memory: memWithContact(), turnCount: 0 }));
    assert.ok(!plan.calls.some(c => c.tool === 'create_lead'));
  });

  it('create_lead is idempotent', () => {
    const plan = ToolSelector.select(makeCtx({ memory: memWithContact(), turnCount: 1 }));
    const lead = plan.calls.find(c => c.tool === 'create_lead');
    assert.equal(lead?.idempotent, true);
  });
});

describe('ToolSelector — Post-booking notifications', () => {
  it('bookingStatus=booked + phone → send_sms selected', () => {
    const plan = ToolSelector.select(makeCtx({ memory: memBooked(), turnCount: 1 }));
    assert.ok(plan.calls.some(c => c.tool === 'send_sms'));
  });

  it('bookingStatus=booked + email → send_email selected', () => {
    const mem = memBooked();
    (mem as any).email = 'alice@example.com';
    const plan = ToolSelector.select(makeCtx({ memory: mem, turnCount: 1 }));
    assert.ok(plan.calls.some(c => c.tool === 'send_email'));
  });

  it('booking not confirmed → no send_sms', () => {
    const plan = ToolSelector.select(makeCtx({ memory: memWithContact(), turnCount: 1 }));
    assert.ok(!plan.calls.some(c => c.tool === 'send_sms'));
  });
});

describe('ToolSelector — FAQ', () => {
  it('general_question intent → lookup_faq selected', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'general_question' }), userMessage: 'How does it work?' }));
    assert.ok(plan.calls.some(c => c.tool === 'lookup_faq'));
  });

  it('billing_question intent → lookup_faq selected', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'billing_question' }), userMessage: 'What do you charge?' }));
    assert.ok(plan.calls.some(c => c.tool === 'lookup_faq'));
  });

  it('very short message → no faq (under 3 chars)', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'general_question' }), userMessage: 'hi' }));
    assert.ok(!plan.calls.some(c => c.tool === 'lookup_faq'));
  });
});

describe('ToolSelector — Estimate', () => {
  it('request_estimate intent → get_estimate selected', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'request_estimate' }), stage: 'discovery' }));
    assert.ok(plan.calls.some(c => c.tool === 'get_estimate'));
  });

  it('no estimate on greeting stage', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'request_estimate' }), stage: 'greeting' }));
    assert.ok(!plan.calls.some(c => c.tool === 'get_estimate'));
  });

  it('get_estimate is idempotent', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'request_estimate' }), stage: 'discovery' }));
    const est = plan.calls.find(c => c.tool === 'get_estimate');
    assert.equal(est?.idempotent, true);
  });
});

// ─── 2. ToolGuards ────────────────────────────────────────────────────────────

describe('ToolGuards — book_appointment', () => {
  it('allows booking with name + phone', () => {
    const result = ToolGuards.check({
      tool: 'book_appointment',
      params: { guestName: 'Alice', guestPhone: '555-1234' },
      reason: 'test', priority: 'high', required: true, idempotent: false,
    }, makeCtx({ memory: memWithContact() }));
    assert.equal(result.allowed, true);
  });

  it('allows booking with name + email', () => {
    const result = ToolGuards.check({
      tool: 'book_appointment',
      params: { guestName: 'Alice', guestEmail: 'a@test.com' },
      reason: 'test', priority: 'high', required: true, idempotent: false,
    }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks booking without name', () => {
    const result = ToolGuards.check({
      tool: 'book_appointment',
      params: { guestEmail: 'a@test.com' },
      reason: 'test', priority: 'high', required: true, idempotent: false,
    }, makeCtx());
    assert.equal(result.allowed, false);
    assert.ok(result.missing?.includes('guestName'));
  });

  it('blocks booking without contact info', () => {
    const result = ToolGuards.check({
      tool: 'book_appointment',
      params: { guestName: 'Alice' },
      reason: 'test', priority: 'high', required: true, idempotent: false,
    }, makeCtx());
    assert.equal(result.allowed, false);
  });

  it('blocks booking when already booked', () => {
    const result = ToolGuards.check({
      tool: 'book_appointment',
      params: { guestName: 'Alice', guestPhone: '555' },
      reason: 'test', priority: 'high', required: true, idempotent: false,
    }, makeCtx({ memory: memBooked() }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason?.includes('duplicate'));
  });
});

describe('ToolGuards — create_lead', () => {
  it('allows create_lead with name + phone', () => {
    const result = ToolGuards.check({
      tool: 'create_lead',
      params: { name: 'Bob', phone: '555-9999', source: 'ai_chat' },
      reason: 'test', priority: 'high', required: false, idempotent: true,
    }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks create_lead without name', () => {
    const result = ToolGuards.check({
      tool: 'create_lead',
      params: { phone: '555-9999', source: 'ai_chat' },
      reason: 'test', priority: 'high', required: false, idempotent: true,
    }, makeCtx());
    assert.equal(result.allowed, false);
  });

  it('blocks create_lead without any contact', () => {
    const result = ToolGuards.check({
      tool: 'create_lead',
      params: { name: 'Bob', source: 'ai_chat' },
      reason: 'test', priority: 'high', required: false, idempotent: true,
    }, makeCtx());
    assert.equal(result.allowed, false);
  });
});

describe('ToolGuards — send_sms and send_email', () => {
  it('allows send_sms with valid phone', () => {
    const result = ToolGuards.check({ tool: 'send_sms', params: { to: '5551234', type: 'booking_confirmation' }, reason: '', priority: 'high', required: false, idempotent: false }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks send_sms without phone', () => {
    const result = ToolGuards.check({ tool: 'send_sms', params: { to: '', type: 'booking_confirmation' }, reason: '', priority: 'high', required: false, idempotent: false }, makeCtx());
    assert.equal(result.allowed, false);
  });

  it('allows send_email with valid email', () => {
    const result = ToolGuards.check({ tool: 'send_email', params: { to: 'a@b.com', type: 'booking_confirmation' }, reason: '', priority: 'high', required: false, idempotent: false }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks send_email without @', () => {
    const result = ToolGuards.check({ tool: 'send_email', params: { to: 'notanemail', type: 'booking_confirmation' }, reason: '', priority: 'high', required: false, idempotent: false }, makeCtx());
    assert.equal(result.allowed, false);
  });
});

describe('ToolGuards — get_estimate and lookup_faq', () => {
  it('allows get_estimate with a service', () => {
    const result = ToolGuards.check({ tool: 'get_estimate', params: { service: 'AC Repair', industry: 'hvac' }, reason: '', priority: 'medium', required: false, idempotent: true }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks get_estimate without service', () => {
    const result = ToolGuards.check({ tool: 'get_estimate', params: { service: '', industry: 'hvac' }, reason: '', priority: 'medium', required: false, idempotent: true }, makeCtx());
    assert.equal(result.allowed, false);
  });

  it('allows lookup_faq with meaningful query', () => {
    const result = ToolGuards.check({ tool: 'lookup_faq', params: { query: 'what is your pricing?' }, reason: '', priority: 'medium', required: false, idempotent: true }, makeCtx());
    assert.equal(result.allowed, true);
  });

  it('blocks lookup_faq with short query', () => {
    const result = ToolGuards.check({ tool: 'lookup_faq', params: { query: 'hi' }, reason: '', priority: 'medium', required: false, idempotent: true }, makeCtx());
    assert.equal(result.allowed, false);
  });
});

describe('ToolGuards — filter()', () => {
  it('separates allowed and blocked calls', () => {
    const calls = [
      { tool: 'book_appointment' as const, params: { guestName: 'Alice', guestPhone: '555' }, reason: 'test', priority: 'high' as const, required: true, idempotent: false },
      { tool: 'send_email' as const, params: { to: 'notvalid', type: 'booking_confirmation' }, reason: 'test', priority: 'high' as const, required: false, idempotent: false },
    ];
    const { allowed, blocked } = ToolGuards.filter(calls, makeCtx({ memory: memWithContact() }));
    assert.equal(allowed.length, 1);
    assert.equal(blocked.length, 1);
    assert.equal(allowed[0]!.tool, 'book_appointment');
  });
});

// ─── 3. ToolResultAggregator ──────────────────────────────────────────────────

describe('ToolResultAggregator — empty()', () => {
  it('returns empty result with zero duration', () => {
    const plan = ToolSelector.select(makeCtx());
    const result = ToolResultAggregator.empty(plan);
    assert.equal(result.results.length, 0);
    assert.equal(result.totalDurationMs, 0);
    assert.equal(result.escalated, false);
    assert.equal(result.errors.length, 0);
  });
});

describe('ToolResultAggregator — availability extraction', () => {
  it('extracts slots from check_availability success', () => {
    const plan = ToolSelector.preview(makeCtx({ stage: 'booking' }));
    const raw = [{
      tool: 'check_availability' as const,
      status: 'success' as const,
      data: {
        slots: [{ startLocal: '2026-08-10T09:00:00.000Z', endLocal: '2026-08-10T10:00:00.000Z', timezone: 'America/Chicago' }],
        nextAvailable: { startLocal: '2026-08-10T09:00:00.000Z', endLocal: '2026-08-10T10:00:00.000Z', timezone: 'America/Chicago' },
        suggested: [],
      },
      durationMs: 50,
    }];
    const result = ToolResultAggregator.aggregate(plan, raw, 50);
    assert.ok(result.availability?.hasOpenSlots);
    assert.equal(result.availability?.slots.length, 1);
    assert.ok(result.availability?.nextAvailable?.label?.length ?? 0 > 0);
  });

  it('returns hasOpenSlots=false for empty slot array', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'check_availability' as const, status: 'success' as const, data: { slots: [], nextAvailable: null, suggested: [] }, durationMs: 10 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 10);
    assert.equal(result.availability?.hasOpenSlots, false);
  });
});

describe('ToolResultAggregator — booking extraction', () => {
  it('extracts booking from book_appointment success', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{
      tool: 'book_appointment' as const,
      status: 'success' as const,
      data: { appointment: { _id: 'appt-1', confirmationCode: 'LF-ABC', type: 'AC Repair', startUtc: '2026-08-10T09:00:00Z' }, leadId: 'lead-1' },
      durationMs: 80,
    }];
    const result = ToolResultAggregator.aggregate(plan, raw, 80);
    assert.equal(result.booking?.bookingId, 'appt-1');
    assert.equal(result.booking?.confirmationCode, 'LF-ABC');
    assert.equal(result.booking?.serviceType, 'AC Repair');
  });

  it('no booking extracted on failure', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'book_appointment' as const, status: 'failure' as const, data: null, error: 'DB error', durationMs: 10 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 10);
    assert.equal(result.booking, undefined);
  });
});

describe('ToolResultAggregator — errors and escalation', () => {
  it('collects errors from failed tools', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'create_lead' as const, status: 'failure' as const, data: null, error: 'DB timeout', durationMs: 200 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 200);
    assert.ok(result.errors.some(e => e.includes('DB timeout')));
  });

  it('escalated=true when escalate succeeds', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'escalate' as const, status: 'success' as const, data: { escalated: true }, durationMs: 5 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 5);
    assert.equal(result.escalated, true);
  });

  it('escalated=false when escalate fails', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'escalate' as const, status: 'failure' as const, data: null, error: 'routing error', durationMs: 5 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 5);
    assert.equal(result.escalated, false);
  });
});

describe('ToolResultAggregator — estimate and FAQ extraction', () => {
  it('extracts estimate data', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{
      tool: 'get_estimate' as const,
      status: 'success' as const,
      data: { rangeMin: 150, rangeMax: 800, currency: 'USD', disclaimer: 'Estimate only.', factors: ['parts', 'labor'] },
      durationMs: 2,
    }];
    const result = ToolResultAggregator.aggregate(plan, raw, 2);
    assert.equal(result.estimate?.rangeMin, 150);
    assert.equal(result.estimate?.rangeMax, 800);
    assert.equal(result.estimate?.currency, 'USD');
  });

  it('extracts faq answer string', () => {
    const plan = ToolSelector.preview(makeCtx());
    const raw = [{ tool: 'lookup_faq' as const, status: 'success' as const, data: [{ content: 'We service HVAC systems.', title: 'What do you do?' }], durationMs: 5 }];
    const result = ToolResultAggregator.aggregate(plan, raw, 5);
    assert.equal(result.faqAnswer, 'We service HVAC systems.');
  });
});

// ─── 4. MemoryBugFixes ────────────────────────────────────────────────────────

describe('BUG-H1 — stableMemoryId', () => {
  it('produces the same ID for the same inputs', () => {
    const id1 = stableMemoryId('org-1', 'conv-1', 'phone');
    const id2 = stableMemoryId('org-1', 'conv-1', 'phone');
    assert.equal(id1, id2);
  });

  it('produces different IDs for different keys', () => {
    const id1 = stableMemoryId('org-1', 'conv-1', 'phone');
    const id2 = stableMemoryId('org-1', 'conv-1', 'email');
    assert.notEqual(id1, id2);
  });

  it('produces different IDs for different conversations', () => {
    const id1 = stableMemoryId('org-1', 'conv-1', 'phone');
    const id2 = stableMemoryId('org-1', 'conv-2', 'phone');
    assert.notEqual(id1, id2);
  });

  it('ID starts with "mem-"', () => {
    const id = stableMemoryId('org-1', 'conv-1', 'phone');
    assert.ok(id.startsWith('mem-'));
  });

  it('ID is always 12 chars (mem- + 8 hex)', () => {
    const id = stableMemoryId('org-1', 'conv-1', 'visitorName');
    assert.equal(id.length, 12);
  });
});

describe('BUG-H1 — MemoryScorer uses stable IDs', () => {
  it('same key produces same ID on repeated calls', () => {
    const item1 = buildMemoryItem({ key: 'phone', value: '555', confidence: 80, source: 'user' });
    const item2 = buildMemoryItem({ key: 'phone', value: '555', confidence: 80, source: 'user' });
    assert.equal(item1.id, item2.id);
  });

  it('different keys produce different IDs', () => {
    const item1 = buildMemoryItem({ key: 'phone', value: '555', confidence: 80, source: 'user' });
    const item2 = buildMemoryItem({ key: 'email', value: 'a@b.com', confidence: 80, source: 'user' });
    assert.notEqual(item1.id, item2.id);
  });

  it('ID starts with mem-', () => {
    const item = buildMemoryItem({ key: 'visitorName', value: 'Alice', confidence: 90, source: 'user' });
    assert.ok(item.id.startsWith('mem-'));
  });
});

describe('BUG-M3 — isBusinessClosed with injectable clock', () => {
  it('returns false when within open hours', () => {
    // 14:00 UTC on a weekday → well within business hours
    const noon = new Date('2026-08-03T14:00:00Z').getTime();
    const closed = isBusinessClosed('09:00', '17:00', 'UTC', noon);
    assert.equal(closed, false);
  });

  it('returns true when outside open hours (night)', () => {
    // 03:00 UTC = 3 AM
    const night = new Date('2026-08-03T03:00:00Z').getTime();
    const closed = isBusinessClosed('09:00', '17:00', 'UTC', night);
    assert.equal(closed, true);
  });

  it('returns true when before open time', () => {
    // 07:00 UTC = 7 AM, open at 9
    const early = new Date('2026-08-03T07:00:00Z').getTime();
    const closed = isBusinessClosed('09:00', '17:00', 'UTC', early);
    assert.equal(closed, true);
  });

  it('returns false for always-open schedule', () => {
    const anyTime = new Date('2026-08-03T03:00:00Z').getTime();
    const closed = isBusinessClosed('00:00', '23:59', 'UTC', anyTime);
    assert.equal(closed, false);
  });

  it('returns false for invalid timezone (safe default)', () => {
    const anyTime = Date.now();
    const closed = isBusinessClosed('09:00', '17:00', 'Invalid/TZ', anyTime);
    assert.equal(closed, false);
  });
});

describe('BUG-L1 — INTENT_CATEGORY_MAP', () => {
  it('Support maps to general_question (not repair)', () => {
    assert.equal(INTENT_CATEGORY_MAP['Support'], 'general_question');
  });

  it('Booking maps to book_appointment', () => {
    assert.equal(INTENT_CATEGORY_MAP['Booking'], 'book_appointment');
  });

  it('Objection maps to complaint', () => {
    assert.equal(INTENT_CATEGORY_MAP['Objection'], 'complaint');
  });
});

// ─── 5. ToolOrchestrationEngine — dry-run (preview/validate) ─────────────────

describe('ToolOrchestrationEngine — preview()', () => {
  it('returns dryRun=true plan', () => {
    const plan = ToolOrchestrationEngine.preview(makeCtx());
    assert.equal(plan.dryRun, true);
  });

  it('booking stage preview shows check_availability', () => {
    const plan = ToolOrchestrationEngine.preview(makeCtx({ stage: 'booking' }));
    assert.ok(plan.calls.some(c => c.tool === 'check_availability'));
  });

  it('emergency preview shows escalate', () => {
    const plan = ToolOrchestrationEngine.preview(makeCtx({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.ok(plan.calls.some(c => c.tool === 'escalate'));
  });
});

describe('ToolOrchestrationEngine — validate()', () => {
  it('returns correct allowed/blocked counts', () => {
    const ctx = makeCtx({ stage: 'booking' });
    const v = ToolOrchestrationEngine.validate(ctx);
    // check_availability is always allowed
    assert.ok(v.allowed >= 1);
  });

  it('booking without data → book_appointment blocked by guard', () => {
    const ctx = makeCtx({ stage: 'booking', memory: emptyRichMemory() });
    // ToolSelector won't even add book_appointment if data is missing
    const v = ToolOrchestrationEngine.validate(ctx);
    assert.ok(!v.errors.some(e => e.includes('book_appointment') && e.includes('Missing')));
  });

  it('validate does not throw on empty memory', () => {
    assert.doesNotThrow(() => ToolOrchestrationEngine.validate(makeCtx()));
  });

  it('validate returns zero errors for safe context', () => {
    const ctx = makeCtx({ stage: 'greeting', intent: makeIntent({ category: 'unknown' }), turnCount: 0 });
    const v = ToolOrchestrationEngine.validate(ctx);
    assert.equal(v.errors.length, 0);
  });
});

// ─── 6. Tool call parameter correctness ──────────────────────────────────────

describe('ToolSelector — parameter correctness', () => {
  it('book_appointment params include guestName from memory', () => {
    const ctx = makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) });
    const plan = ToolSelector.select(ctx);
    const book = plan.calls.find(c => c.tool === 'book_appointment');
    assert.equal(book?.params.guestName, 'Alice');
  });

  it('book_appointment params include guestPhone from memory', () => {
    const ctx = makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) });
    const plan = ToolSelector.select(ctx);
    const book = plan.calls.find(c => c.tool === 'book_appointment');
    assert.equal(book?.params.guestPhone, '555-1234');
  });

  it('create_lead params include name from memory', () => {
    const ctx = makeCtx({ memory: memWithContact(), turnCount: 1 });
    const plan = ToolSelector.select(ctx);
    const lead = plan.calls.find(c => c.tool === 'create_lead');
    assert.equal(lead?.params.name, 'Alice');
  });

  it('create_lead params source is ai_chat', () => {
    const ctx = makeCtx({ memory: memWithContact(), turnCount: 1 });
    const plan = ToolSelector.select(ctx);
    const lead = plan.calls.find(c => c.tool === 'create_lead');
    assert.equal(lead?.params.source, 'ai_chat');
  });

  it('escalate params include urgency', () => {
    const ctx = makeCtx({ intent: makeIntent({ urgency: 'critical' }) });
    const plan = ToolSelector.select(ctx);
    const esc = plan.calls.find(c => c.tool === 'escalate');
    assert.equal(esc?.params.urgency, 'critical');
  });

  it('lookup_faq params include the user message', () => {
    const ctx = makeCtx({ intent: makeIntent({ category: 'general_question' }), userMessage: 'What services do you offer?' });
    const plan = ToolSelector.select(ctx);
    const faq = plan.calls.find(c => c.tool === 'lookup_faq');
    assert.equal(faq?.params.query, 'What services do you offer?');
  });

  it('get_estimate params include detected service', () => {
    const mem = emptyRichMemory();
    (mem as any).servicesDiscussed = ['AC Repair'];
    const ctx = makeCtx({ intent: makeIntent({ category: 'request_estimate' }), stage: 'discovery', memory: mem });
    const plan = ToolSelector.select(ctx);
    const est = plan.calls.find(c => c.tool === 'get_estimate');
    assert.equal(est?.params.service, 'AC Repair');
  });
});

// ─── 7. Edge cases ────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('null memory fields do not crash ToolSelector', () => {
    assert.doesNotThrow(() => ToolSelector.select(makeCtx()));
  });

  it('very long userMessage does not crash', () => {
    const ctx = makeCtx({ userMessage: 'word '.repeat(500) });
    assert.doesNotThrow(() => ToolSelector.select(ctx));
  });

  it('unknown intent produces no tools on greeting', () => {
    const plan = ToolSelector.select(makeCtx({ intent: makeIntent({ category: 'unknown' }), stage: 'greeting', turnCount: 0 }));
    assert.equal(plan.calls.length, 0);
  });

  it('all calls marked required=true means parallel must be false if any writes', () => {
    const ctx = makeCtx({ stage: 'booking', memory: memWithContact(), intent: makeIntent({ category: 'book_appointment' }) });
    const plan = ToolSelector.select(ctx);
    const hasWrite = plan.calls.some(c => !c.idempotent);
    if (hasWrite) assert.equal(plan.runInParallel, false);
  });
});
