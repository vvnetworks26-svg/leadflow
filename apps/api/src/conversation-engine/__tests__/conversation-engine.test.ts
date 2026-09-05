/**
 * conversation-engine/__tests__/conversation-engine.test.ts
 * Run: npx tsx src/conversation-engine/__tests__/conversation-engine.test.ts
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { ConversationOrchestrationService, setBlueprintRepository } from '../ConversationOrchestrationService';
import { InMemoryBlueprintRepository }  from '../repository/InMemoryBlueprintRepository';
import { BlueprintCache }               from '../cache/BlueprintCache';
import { evaluateRules }                from '../modules/rule-engine';
import { evaluateState }                from '../modules/state-evaluator';
import { selectObjective }              from '../modules/objective-selector';
import { isObjectiveComplete }          from '../modules/completion-evaluator';
import { detectRecoverySignal }         from '../modules/recovery-manager';
import { buildConversationPlan }        from '../modules/conversation-plan-builder';
import { ConversationBlueprintSchema }  from '../schemas';
import { HVAC_REPAIR_BLUEPRINT, HVAC_EMERGENCY_BLUEPRINT, DEFAULT_BLUEPRINTS } from '../blueprints/default-blueprints';
import { emptyRichMemory, emptyProgress } from '../../ai/types';
import type { OrchestrationInput }      from '../types';
import type { BusinessIdentity }        from '../../business-identity/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeIdentity(overrides: Partial<BusinessIdentity> = {}): BusinessIdentity {
  // All days open 00:00–23:59 so business_closed rule never fires during tests
  const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };
  return {
    organizationId: 'org-test',
    companyProfile: { businessId: 'org-test', businessName: 'Test HVAC', legalName: '', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo:    { phone: '555-000-1111', email: '', address: '', city: '', state: '', country: 'US', timezone: 'America/New_York' },
    serviceArea:    { primaryCity: '', cities: [], counties: [], zipCodes: [], radiusMiles: null, travelFeeRules: [], enabled: true },
    servicesCatalog:[],
    businessHours:  { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    brandPersonality:{ tone: 'friendly', energy: 'medium', empathy: 'high', emojiPolicy: 'sparingly', sentenceStyle: 'conversational', humor: false },
    receptionistIdentity:{ aiName: 'Emma', role: 'Coordinator', greetingTemplate: '', introductionTemplate: '', signOffTemplate: '' },
    conversationRules:{ enabled: [], custom: [] },
    bookingRules:   { minimumNoticeHours: 1, maximumBookingDays: 90, defaultDurationMins: 60, slotIntervalMins: 30, sameDayBooking: true, weekendBooking: false, businessBufferMins: 0 },
    emergencyPolicy:{ enabled: true, triggers: [{ keyword: 'no heat', priority: 'critical' }] },
    escalationPolicy:{ triggers: ['customer_requests_human'], confidenceThreshold: 30, escalationMessage: '' },
    permissions:    { allowed: ['book_appointment'], denied: ['negotiate_pricing'] },
    integrations:   [],
    businessGoals:  [{ priority: 'primary', description: 'Book appointments' }],
    loadedAt:       new Date(),
    ...overrides,
  } as BusinessIdentity;
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1', category: 'repair' as const, subCategory: '',
    confidenceLevel: 'high' as const, urgency: 'normal' as const,
    detectedService: null, entities: [], candidates: [],
    reasoning: '', blueprintId: 'hvac.repair', requiresHuman: false,
    requiresClarification: false, rawMessage: 'fix my AC', timestamp: new Date(),
    ...overrides,
  };
}

function makeInput(overrides: Partial<OrchestrationInput> = {}): OrchestrationInput {
  return {
    organizationId:   'org-test',
    conversationId:   'conv-1',
    identity:         makeIdentity(),
    intent:           makeIntent(),
    memory:           emptyRichMemory(),
    progress:         emptyProgress(),
    history:          [],
    turnCount:        0,
    currentObjective: null,
    workflowState:    null,
    currentBlueprintId: null,
    ...overrides,
  };
}

// ─── Blueprint loading ────────────────────────────────────────────────────────

describe('Blueprint loading', () => {
  before(() => setBlueprintRepository(new InMemoryBlueprintRepository()));

  it('loads hvac.repair by id', async () => {
    const bp = await ConversationOrchestrationService.loadBlueprint('hvac.repair', 'hvac', 'repair');
    assert.equal(bp?.id, 'hvac.repair');
  });

  it('loads by industry + intent when no id supplied', async () => {
    const bp = await ConversationOrchestrationService.loadBlueprint(null, 'hvac', 'repair');
    assert.equal(bp?.id, 'hvac.repair');
  });

  it('returns wildcard blueprint for unknown industry', async () => {
    const bp = await ConversationOrchestrationService.loadBlueprint(null, 'bakery', 'general_question');
    assert.equal(bp?.id, 'generic.faq');
  });

  it('returns null for completely unknown combination', async () => {
    const bp = await ConversationOrchestrationService.loadBlueprint(null, 'bakery', 'warranty');
    assert.equal(bp, null);
  });
});

// ─── Blueprint schema validation ──────────────────────────────────────────────

describe('Blueprint schema validation', () => {
  it('all default blueprints pass schema validation', () => {
    for (const bp of DEFAULT_BLUEPRINTS) {
      assert.doesNotThrow(() => ConversationBlueprintSchema.parse(bp), `${bp.id} failed validation`);
    }
  });

  it('rejects blueprint with missing defaultStageId reference', () => {
    assert.throws(() => ConversationBlueprintSchema.parse({
      ...HVAC_REPAIR_BLUEPRINT,
      defaultStageId: 'nonexistent_stage',
    }));
  });

  it('rejects blueprint with no stages', () => {
    assert.throws(() => ConversationBlueprintSchema.parse({
      ...HVAC_REPAIR_BLUEPRINT,
      stages: [],
    }));
  });
});

// ─── State Evaluator ──────────────────────────────────────────────────────────

describe('State Evaluator', () => {
  it('returns emergency_dispatch for critical urgency', () => {
    const state = evaluateState({ memory: emptyRichMemory(), blueprint: HVAC_REPAIR_BLUEPRINT, urgency: 'critical', currentObjective: null, requiresHuman: false, turnCount: 0 });
    assert.equal(state, 'emergency_dispatch');
  });

  it('returns escalating when requiresHuman=true', () => {
    const state = evaluateState({ memory: emptyRichMemory(), blueprint: HVAC_REPAIR_BLUEPRINT, urgency: 'normal', currentObjective: null, requiresHuman: true, turnCount: 0 });
    assert.equal(state, 'escalating');
  });

  it('returns completed when objective is complete_conversation', () => {
    const state = evaluateState({ memory: emptyRichMemory(), blueprint: HVAC_REPAIR_BLUEPRINT, urgency: 'normal', currentObjective: 'complete_conversation', requiresHuman: false, turnCount: 5 });
    assert.equal(state, 'completed');
  });

  it('returns collecting_info when collecting a field', () => {
    const state = evaluateState({ memory: emptyRichMemory(), blueprint: HVAC_REPAIR_BLUEPRINT, urgency: 'normal', currentObjective: 'collect_phone', requiresHuman: false, turnCount: 2 });
    assert.equal(state, 'collecting_info');
  });

  it('returns initialising when no blueprint loaded', () => {
    const state = evaluateState({ memory: emptyRichMemory(), blueprint: null, urgency: 'normal', currentObjective: null, requiresHuman: false, turnCount: 0 });
    assert.equal(state, 'initialising');
  });
});

// ─── Rule Engine ──────────────────────────────────────────────────────────────

describe('Rule Engine', () => {
  const baseCtx = {
    memory: emptyRichMemory(), urgency: 'normal' as const,
    intent: 'repair' as const, requiresHuman: false,
    businessHours: makeIdentity().businessHours,
    timezone: 'America/New_York',
  };

  it('fires urgency_critical rule', () => {
    const result = evaluateRules({ ...baseCtx, urgency: 'critical', rules: HVAC_REPAIR_BLUEPRINT.rules });
    assert.equal(result.fired, true);
    assert.ok(['handle_emergency', 'escalate_to_human'].includes(result.targetObjective!));
  });

  it('fires customer_wants_human rule', () => {
    const result = evaluateRules({ ...baseCtx, requiresHuman: true, rules: HVAC_REPAIR_BLUEPRINT.rules });
    assert.equal(result.fired, true);
    assert.equal(result.targetObjective, 'escalate_to_human');
  });

  it('fires complaint rule', () => {
    const result = evaluateRules({ ...baseCtx, intent: 'complaint' as const, rules: HVAC_REPAIR_BLUEPRINT.rules });
    assert.equal(result.fired, true);
    assert.equal(result.targetObjective, 'handle_complaint');
  });

  it('does not fire rules when conditions are normal', () => {
    const result = evaluateRules({ ...baseCtx, rules: HVAC_REPAIR_BLUEPRINT.rules });
    assert.equal(result.fired, false);
  });

  it('highest priority rule wins when multiple fire', () => {
    const result = evaluateRules({ ...baseCtx, urgency: 'critical' as const, requiresHuman: true, rules: HVAC_REPAIR_BLUEPRINT.rules });
    assert.equal(result.fired, true);
    // human (95) vs critical (100) — critical wins
    assert.equal(result.ruleId, 'rule_critical_urgency');
  });

  // Regression: rule_business_closed used to fire on turn one of ANY
  // after-hours conversation regardless of progress, jumping straight to
  // 'offer_appointment' (which exposes book_appointment) before name/phone
  // were ever collected. The widget then showed the slot picker, the
  // visitor picked a slot and submitted, and POST /book correctly rejected
  // with 422 "hasn't collected the visitor's name and phone number yet" —
  // a booking attempt that could never have succeeded, with no upfront
  // indication to the visitor that anything was wrong until the very end.
  const closedHours = { ...makeIdentity().businessHours, vacationMode: true };

  it('does NOT fire business_closed when name/phone are not yet collected', () => {
    const result = evaluateRules({
      ...baseCtx,
      memory: emptyRichMemory(), // progress: all false — nothing collected yet
      businessHours: closedHours,
      rules: HVAC_REPAIR_BLUEPRINT.rules,
    });
    assert.equal(result.fired, false, 'must not short-circuit to offer_appointment before contact info exists');
  });

  it('fires business_closed once name and phone are already collected', () => {
    const collectedMemory = emptyRichMemory();
    collectedMemory.progress.visitorNameCollected = true;
    collectedMemory.progress.phoneCollected       = true;

    const result = evaluateRules({
      ...baseCtx,
      memory: collectedMemory,
      businessHours: closedHours,
      rules: HVAC_REPAIR_BLUEPRINT.rules,
    });
    assert.equal(result.fired, true);
    assert.equal(result.ruleId, 'rule_business_closed');
    assert.equal(result.targetObjective, 'offer_appointment');
  });

  it('does not fire business_closed when only one of name/phone is collected', () => {
    const partialMemory = emptyRichMemory();
    partialMemory.progress.visitorNameCollected = true;
    // phoneCollected left false

    const result = evaluateRules({
      ...baseCtx,
      memory: partialMemory,
      businessHours: closedHours,
      rules: HVAC_REPAIR_BLUEPRINT.rules,
    });
    assert.equal(result.fired, false);
  });
});

// ─── Objective Selector ───────────────────────────────────────────────────────

describe('Objective Selector', () => {
  const base = { blueprint: HVAC_REPAIR_BLUEPRINT, workflowState: 'collecting_info' as const, intentCategory: 'repair' as const, currentObjective: null as any, bookingConfirmed: false };

  it('selects build_rapport (greet stage) when nothing collected', () => {
    const obj = selectObjective({ ...base, progress: emptyProgress() });
    assert.equal(obj, 'build_rapport');
  });

  it('advances to collect_service_details after name collected', () => {
    const p = { ...emptyProgress(), visitorNameCollected: true };
    const obj = selectObjective({ ...base, progress: p });
    assert.equal(obj, 'collect_service_details');
  });

  it('skips to collect_phone when service + emergency already collected', () => {
    const p = { ...emptyProgress(), visitorNameCollected: true, serviceCollected: true, emergencyCollected: true };
    const obj = selectObjective({ ...base, progress: p });
    assert.equal(obj, 'collect_phone');
  });

  it('returns complete_conversation when all fields collected', () => {
    const p = { ...emptyProgress(), visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true, addressCollected: true, appointmentCollected: true };
    const obj = selectObjective({ ...base, progress: p, bookingConfirmed: true });
    assert.equal(obj, 'complete_conversation');
  });

  it('returns escalate_to_human when state is escalating', () => {
    const obj = selectObjective({ ...base, progress: emptyProgress(), workflowState: 'escalating' });
    assert.equal(obj, 'escalate_to_human');
  });
});

// ─── Completion Evaluator ─────────────────────────────────────────────────────

describe('Completion Evaluator', () => {
  it('collect_phone complete when phoneCollected=true', () => {
    const p = { ...emptyProgress(), phoneCollected: true };
    assert.equal(isObjectiveComplete('collect_phone', p, emptyRichMemory()), true);
  });

  it('collect_phone incomplete when phoneCollected=false', () => {
    assert.equal(isObjectiveComplete('collect_phone', emptyProgress(), emptyRichMemory()), false);
  });

  it('confirm_appointment complete when bookingStatus=booked', () => {
    const mem = { ...emptyRichMemory(), bookingStatus: 'booked' as const };
    assert.equal(isObjectiveComplete('confirm_appointment', emptyProgress(), mem as any), true);
  });

  it('complete_conversation always returns true', () => {
    assert.equal(isObjectiveComplete('complete_conversation', emptyProgress(), emptyRichMemory()), true);
  });
});

// ─── Recovery Manager ─────────────────────────────────────────────────────────

describe('Recovery Manager', () => {
  const strategy = { onAmbiguity: 'clarify_intent' as const, onRepeat: 'clarify_intent' as const, onContradiction: 'clarify_intent' as const, onTopicChange: 'build_rapport' as const, preserveContext: true };
  const base = { intent: 'repair' as const, currentObjective: 'collect_phone' as const, memory: emptyRichMemory(), strategy, turnCount: 3 };

  it('detects already_answered signal', () => {
    const r = detectRecoverySignal({ ...base, message: 'I already told you my phone number' });
    assert.equal(r.signal, 'already_answered');
    assert.equal(r.newObjective, 'collect_phone');  // stays on same objective
  });

  it('detects dont_know signal', () => {
    const r = detectRecoverySignal({ ...base, message: "I don't know" });
    assert.equal(r.signal, 'dont_know');
  });

  it('detects topic_change on billing intent', () => {
    const r = detectRecoverySignal({ ...base, intent: 'billing_question' as const, message: 'I have a question about my bill' });
    assert.equal(r.signal, 'topic_change');
    assert.equal(r.newObjective, 'handle_billing');
  });

  it('returns none for normal reply', () => {
    const r = detectRecoverySignal({ ...base, message: '555-123-4567' });
    assert.equal(r.signal, 'none');
  });

  it('detects correction signal', () => {
    const r = detectRecoverySignal({ ...base, message: 'Actually, my phone is 555-999-0000' });
    assert.equal(r.signal, 'correction');
  });
});

// ─── ConversationPlan Builder ─────────────────────────────────────────────────

describe('ConversationPlan Builder', () => {
  it('builds a frozen plan for collect_phone', () => {
    const plan = buildConversationPlan({ objective: 'collect_phone', workflowState: 'collecting_info', blueprint: HVAC_REPAIR_BLUEPRINT, ruleApplied: null, reason: 'test' });
    assert.equal(plan.objective, 'collect_phone');
    assert.equal(plan.requiredField, 'phone');
    assert.equal(plan.questionType, 'phone');
    assert.equal(plan.priority, 'high');
    assert.equal(plan.isTerminal, false);
    assert.throws(() => { (plan as any).objective = 'hacked'; }, TypeError);
  });

  it('marks escalate_to_human as terminal', () => {
    const plan = buildConversationPlan({ objective: 'escalate_to_human', workflowState: 'escalating', blueprint: HVAC_ESCALATION_OR_NULL, ruleApplied: 'rule_x', reason: 'test' });
    assert.equal(plan.isTerminal, true);
    assert.equal(plan.ruleApplied, 'rule_x');
  });

  it('includes allowed tools', () => {
    const plan = buildConversationPlan({ objective: 'offer_appointment', workflowState: 'booking_in_progress', blueprint: HVAC_REPAIR_BLUEPRINT, ruleApplied: null, reason: 'test' });
    assert.ok(plan.allowedTools.includes('check_availability'));
    assert.ok(plan.allowedTools.includes('book_appointment'));
  });
});

const HVAC_ESCALATION_OR_NULL = null;

// ─── Full orchestrate() pipeline ─────────────────────────────────────────────

describe('ConversationOrchestrationService.orchestrate() — full pipeline', () => {
  before(() => {
    setBlueprintRepository(new InMemoryBlueprintRepository());
    ConversationOrchestrationService.invalidateBlueprintCache();
  });

  it('first turn → build_rapport objective', async () => {
    ConversationOrchestrationService.invalidateBlueprintCache();
    const result = await ConversationOrchestrationService.orchestrate(makeInput({
      intent: makeIntent({ category: 'repair', blueprintId: 'hvac.repair' }),
    }));
    assert.equal(result.plan.objective, 'build_rapport');
    assert.equal(result.blueprintId, 'hvac.repair');
  });

  it('emergency intent → handle_emergency objective', async () => {
    const result = await ConversationOrchestrationService.orchestrate(makeInput({
      intent: makeIntent({ urgency: 'critical', category: 'emergency_service', blueprintId: 'hvac.emergency' }),
    }));
    assert.equal(result.plan.objective, 'handle_emergency');
    assert.equal(result.updatedWorkflowState, 'emergency_dispatch');
  });

  it('human_representative intent → escalate_to_human', async () => {
    const result = await ConversationOrchestrationService.orchestrate(makeInput({
      intent: makeIntent({ category: 'human_representative', requiresHuman: true }),
    }));
    assert.equal(result.plan.objective, 'escalate_to_human');
    assert.equal(result.plan.isTerminal, true);
  });

  it('advances to collect_service_details after name collected', async () => {
    ConversationOrchestrationService.invalidateBlueprintCache();
    const p = { ...emptyProgress(), visitorNameCollected: true };
    const result = await ConversationOrchestrationService.orchestrate(makeInput({
      progress: p,
      intent: makeIntent({ category: 'repair', blueprintId: 'hvac.repair' }),
    }));
    // The repair blueprint: greet is complete (visitorName collected) → next is collect_service_details
    // The booking blueprint: greet skipWhen=['visitorNameCollected'] → skipped → collect_service → not complete → collect_service_details
    // Both blueprints should yield collect_service_details here
    assert.ok(
      result.plan.objective === 'collect_service_details',
      `Expected collect_service_details, got "${result.plan.objective}" (blueprint: ${result.blueprintId})`
    );
  });

  it('advances to offer_appointment when all pre-booking fields collected', async () => {
    const p = { ...emptyProgress(), visitorNameCollected: true, serviceCollected: true, emergencyCollected: true, phoneCollected: true, addressCollected: true };
    const result = await ConversationOrchestrationService.orchestrate(makeInput({ progress: p }));
    assert.equal(result.plan.objective, 'offer_appointment');
  });

  it('plan is always immutable', async () => {
    const result = await ConversationOrchestrationService.orchestrate(makeInput());
    assert.throws(() => { (result.plan as any).objective = 'hacked'; }, TypeError);
  });

  it('plan always has a reason', async () => {
    const result = await ConversationOrchestrationService.orchestrate(makeInput());
    assert.ok(result.plan.reason.length > 0);
  });

  it('plumbing emergency → plumbing.emergency blueprint', async () => {
    const identity = makeIdentity({ companyProfile: { ...makeIdentity().companyProfile, industry: 'plumbing' } } as any);
    const result = await ConversationOrchestrationService.orchestrate(makeInput({
      identity,
      intent: makeIntent({ category: 'emergency_service', urgency: 'critical', blueprintId: 'plumbing.emergency' }),
    }));
    assert.ok(['plumbing.emergency', 'hvac.emergency'].includes(result.blueprintId ?? ''));
  });

  it('returns safe fallback on bad input, never throws', async () => {
    const result = await ConversationOrchestrationService.orchestrate(makeInput({ conversationId: '' }));
    assert.ok(result.plan.objective);  // any objective — never throws
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe('BlueprintCache', () => {
  it('stores and retrieves', () => {
    const cache = new BlueprintCache({ ttlMs: 5000 });
    cache.set('hvac.repair', HVAC_REPAIR_BLUEPRINT);
    assert.equal(cache.get('hvac.repair')?.id, 'hvac.repair');
  });

  it('returns null after TTL expiry', async () => {
    const cache = new BlueprintCache({ ttlMs: 50 });
    cache.set('x', HVAC_EMERGENCY_BLUEPRINT);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(cache.get('x'), null);
  });

  it('invalidate removes entry', () => {
    const cache = new BlueprintCache();
    cache.set('hvac.repair', HVAC_REPAIR_BLUEPRINT);
    cache.invalidate('hvac.repair');
    assert.equal(cache.get('hvac.repair'), null);
  });
});
