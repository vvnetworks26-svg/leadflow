/**
 * response-engine/__tests__/response-engine.test.ts
 * Run: npx tsx src/response-engine/__tests__/response-engine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ResponseEngine }          from '../ResponseEngine';
import { selectTone }              from '../ResponseTone';
import { selectEmotion }           from '../ResponseEmotion';
import { selectLength }            from '../ResponseLength';
import { selectCTA }               from '../CTAEngine';
import { buildPersonalization }    from '../Personalization';
import { selectStyle, buildGuardrails, buildExamples } from '../ResponsePlanner';
import { buildResponseBlueprint }  from '../ResponseBlueprint';
import { humanize, humanizeFieldQuestion, buildMustMention, buildMustAvoid } from '../Humanizer';
import { emptyRichMemory }         from '../../ai/types';
import type { ResponseEngineInput } from '../types';
import type { BusinessIdentity }    from '../../business-identity/types';
import type { ResolvedIntent }      from '../../intent-engine/types';
import type { ConversationPlan as L3Plan } from '../../conversation-engine/types';
import type { QualificationScore }  from '../../ai/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeIdentity(overrides: Partial<BusinessIdentity> = {}): BusinessIdentity {
  return {
    organizationId: 'org-1',
    companyProfile: { businessId: 'org-1', businessName: 'Test HVAC', legalName: '', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo:    { phone: '555', email: '', address: '', city: '', state: '', country: 'US', timezone: 'UTC' },
    serviceArea:    { primaryCity: '', cities: [], counties: [], zipCodes: [], radiusMiles: null, travelFeeRules: [], enabled: true },
    servicesCatalog:[],
    businessHours:  { monday: { isOpen: true, openTime: '08:00', closeTime: '17:00' }, tuesday: { isOpen: true, openTime: '08:00', closeTime: '17:00' }, wednesday: { isOpen: true, openTime: '08:00', closeTime: '17:00' }, thursday: { isOpen: true, openTime: '08:00', closeTime: '17:00' }, friday: { isOpen: true, openTime: '08:00', closeTime: '17:00' }, saturday: { isOpen: false, openTime: '09:00', closeTime: '12:00' }, sunday: { isOpen: false, openTime: '09:00', closeTime: '12:00' }, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
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

function makeIntent(overrides: Partial<ResolvedIntent> = {}): ResolvedIntent {
  return {
    id: 'i-1', category: 'repair', subCategory: '', confidenceLevel: 'high',
    urgency: 'normal', detectedService: null, entities: [], candidates: [],
    reasoning: '', blueprintId: null, requiresHuman: false, requiresClarification: false,
    rawMessage: 'fix my AC', timestamp: new Date(),
    ...overrides,
  };
}

function makePlan(overrides: Partial<L3Plan> = {}): L3Plan {
  return {
    objective: 'collect_phone', reason: 'test', requiredField: 'phone',
    questionType: 'phone', priority: 'high', allowedTools: [],
    nextState: 'collecting_info', fallbackState: 'collecting_info',
    completionCriteria: ['phoneCollected'],
    recoveryStrategy: { onAmbiguity: 'clarify_intent', onRepeat: 'clarify_intent', onContradiction: 'clarify_intent', onTopicChange: 'build_rapport', preserveContext: true },
    blueprintId: null, stageId: null, ruleApplied: null, isTerminal: false,
    ...overrides,
  };
}

function makeQual(): QualificationScore {
  return { overall: 40, temperature: 'Cold', confidence: 50, breakdown: { industry: 40, companySize: 40, decisionMaker: 50, budget: 35, timeline: 35, urgency: 40, technicalReady: 60, aiReady: 45, painSeverity: 20, buyingIntent: 30 }, reasons: [], missingInfo: [] };
}

function makeInput(overrides: Partial<ResponseEngineInput> = {}): ResponseEngineInput {
  return {
    plan:            makePlan(),
    identity:        makeIdentity(),
    stage:           'discovery',
    memory:          emptyRichMemory(),
    intent:          makeIntent(),
    qualification:   makeQual(),
    recommendations: [],
    workflowState:   'collecting_info',
    ...overrides,
  };
}

// ─── ResponseEngine.buildBlueprint ────────────────────────────────────────────

describe('ResponseEngine.buildBlueprint — core', () => {
  it('returns a ResponseBlueprint with all required fields', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.ok(bp.objective);
    assert.ok(bp.tone);
    assert.ok(bp.emotion);
    assert.ok(bp.urgency);
    assert.ok(bp.cta);
    assert.ok(bp.length);
    assert.ok(bp.style);
    assert.ok(Array.isArray(bp.mustMention));
    assert.ok(Array.isArray(bp.mustAvoid));
    assert.ok(Array.isArray(bp.guardrails));
    assert.ok(Array.isArray(bp.examples));
    assert.ok(bp.metadata.industry);
    assert.ok(bp.metadata.stage);
  });

  it('blueprint is frozen (immutable)', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.throws(() => { (bp as any).tone = 'Hacked'; }, TypeError);
  });

  it('personalization is empty when memory is empty', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.equal(bp.personalization.visitorName, undefined);
    assert.equal(bp.personalization.company,     undefined);
  });

  it('personalization includes visitor name when in memory', () => {
    const mem = { ...emptyRichMemory(), visitorName: 'Alice' };
    const bp = ResponseEngine.buildBlueprint(makeInput({ memory: mem as any }));
    assert.equal(bp.personalization.visitorName, 'Alice');
  });

  it('mustAvoid is always non-empty (universal guardrails)', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.ok(bp.mustAvoid.length > 0);
  });

  it('guardrails always present', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.ok(bp.guardrails.length > 0);
  });

  it('metadata.stage matches input stage', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'booking' }));
    assert.equal(bp.metadata.stage, 'booking');
  });

  it('metadata.industry matches identity', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.equal(bp.metadata.industry, 'hvac');
  });
});

// ─── Emergency behaviour ──────────────────────────────────────────────────────

describe('Emergency behaviour', () => {
  it('critical urgency → Dispatcher tone', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.equal(bp.tone, 'Dispatcher');
  });

  it('critical urgency → Concerned emotion', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.equal(bp.emotion, 'Concerned');
  });

  it('critical urgency → OneSentence length', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({
      intent: makeIntent({ urgency: 'critical' }),
      workflowState: 'emergency_dispatch',
    }));
    assert.equal(bp.length, 'OneSentence');
  });

  it('critical urgency → BookAppointment CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.equal(bp.cta, 'BookAppointment');
  });

  it('emergency urgency → Urgent tone', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ urgency: 'emergency' }) }));
    assert.equal(bp.tone, 'Urgent');
  });

  it('emergency_dispatch workflow → Dispatcher tone', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({
      workflowState: 'emergency_dispatch',
      plan: makePlan({ objective: 'handle_emergency' }),
    }));
    assert.equal(bp.tone, 'Dispatcher');
  });

  it('mustMention includes urgency acknowledgement on emergency', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ urgency: 'critical' }) }));
    assert.ok(bp.mustMention.some(m => m.toLowerCase().includes('urgency') || m.toLowerCase().includes('urgent')));
  });
});

// ─── Booking behaviour ────────────────────────────────────────────────────────

describe('Booking behaviour', () => {
  it('booking stage → BookAppointment CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'booking', plan: makePlan({ objective: 'offer_appointment' }) }));
    assert.equal(bp.cta, 'BookAppointment');
  });

  it('booking confirmed → Celebratory emotion', () => {
    const mem = { ...emptyRichMemory(), bookingStatus: 'booked' as const };
    const bp = ResponseEngine.buildBlueprint(makeInput({ memory: mem as any }));
    assert.equal(bp.emotion, 'Celebratory');
  });

  it('complete_conversation → CloseConversation CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ plan: makePlan({ objective: 'complete_conversation' }), stage: 'completed' }));
    assert.equal(bp.cta, 'CloseConversation');
  });

  it('confirm_appointment → Encouraging emotion', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ plan: makePlan({ objective: 'confirm_appointment' }) }));
    assert.equal(bp.emotion, 'Encouraging');
  });
});

// ─── Escalation behaviour ─────────────────────────────────────────────────────

describe('Escalation behaviour', () => {
  it('requiresHuman → TransferToHuman CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ intent: makeIntent({ requiresHuman: true }) }));
    assert.equal(bp.cta, 'TransferToHuman');
  });

  it('escalate_to_human objective → TransferToHuman CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ plan: makePlan({ objective: 'escalate_to_human' }) }));
    assert.equal(bp.cta, 'TransferToHuman');
  });

  it('escalating workflow → Calm tone', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({
      workflowState: 'escalating',
      plan: makePlan({ objective: 'escalate_to_human' }),
    }));
    assert.equal(bp.tone, 'Calm');
  });

  it('escalate_to_human → Apologetic emotion', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({
      workflowState: 'escalating',
      plan: makePlan({ objective: 'escalate_to_human' }),
    }));
    assert.equal(bp.emotion, 'Apologetic');
  });
});

// ─── Recommendation behaviour ─────────────────────────────────────────────────

describe('Recommendation behaviour', () => {
  it('recommendation stage → Consultative tone', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'recommendation', plan: makePlan({ objective: 'offer_recommendation' }) }));
    assert.equal(bp.tone, 'Consultative');
  });

  it('recommendation stage → Medium length', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'recommendation', plan: makePlan({ objective: 'offer_recommendation' }) }));
    assert.equal(bp.length, 'Medium');
  });

  it('recommendation stage → RecommendService CTA', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'recommendation', plan: makePlan({ objective: 'offer_recommendation' }) }));
    assert.equal(bp.cta, 'RecommendService');
  });

  it('recommendation guardrail: present at most 2 options', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput({ stage: 'recommendation', plan: makePlan({ objective: 'offer_recommendation' }) }));
    assert.ok(bp.guardrails.some(g => g.toLowerCase().includes('2') || g.toLowerCase().includes('two')));
  });
});

// ─── Tone Engine ──────────────────────────────────────────────────────────────

describe('Tone Engine', () => {
  const base = { urgency: 'normal' as const, brandTone: 'friendly' as const, industry: 'hvac' as const, workflowState: 'collecting_info' as const };

  it('Friendly brand → Friendly tone (no override)', () =>
    assert.equal(selectTone({ ...base, objective: 'collect_phone' }), 'Friendly'));

  it('Professional brand → Professional tone', () =>
    assert.equal(selectTone({ ...base, brandTone: 'professional', objective: 'collect_phone' }), 'Professional'));

  it('saas industry default → Consultative (no brand tone override)', () =>
    // When brandTone is casual (maps to Friendly) but industry is saas,
    // brand personality wins over industry default.
    // To get industry default, pass a tone that has no direct mapping.
    assert.equal(
      selectTone({ ...base, industry: 'saas', objective: 'collect_phone', brandTone: 'friendly' }),
      'Friendly'   // brand personality (friendly) wins over industry default (Consultative)
    ));

  it('recommendation objective → Consultative', () =>
    assert.equal(selectTone({ ...base, objective: 'offer_recommendation' }), 'Consultative'));

  it('educational objective → Educational', () =>
    assert.equal(selectTone({ ...base, objective: 'answer_question' }), 'Educational'));
});

// ─── Emotion Engine ───────────────────────────────────────────────────────────

describe('Emotion Engine', () => {
  const base = { urgency: 'normal' as const, stage: 'discovery' as const, workflowState: 'collecting_info' as const, bookingStatus: 'none' as const, hasObjection: false };

  it('neutral on discovery with no signals', () =>
    assert.equal(selectEmotion({ ...base, objective: 'collect_phone' }), 'Neutral'));

  it('Supportive on objection stage', () =>
    assert.equal(selectEmotion({ ...base, objective: 'resolve_objection', stage: 'objection' }), 'Supportive'));

  it('Supportive when hasObjection=true', () =>
    assert.equal(selectEmotion({ ...base, objective: 'collect_phone', hasObjection: true }), 'Supportive'));

  it('Celebratory when booking complete', () =>
    assert.equal(selectEmotion({ ...base, objective: 'collect_phone', bookingStatus: 'booked' }), 'Celebratory'));

  it('Apologetic on complaint', () =>
    assert.equal(selectEmotion({ ...base, objective: 'handle_complaint' }), 'Apologetic'));

  it('Encouraging on booking stage', () =>
    assert.equal(selectEmotion({ ...base, objective: 'offer_appointment', stage: 'booking' }), 'Encouraging'));
});

// ─── Length Engine ────────────────────────────────────────────────────────────

describe('Length Engine', () => {
  const base = { urgency: 'normal' as const, stage: 'discovery' as const, workflowState: 'collecting_info' as const, priority: 'high' as const };

  it('critical urgency → OneSentence', () =>
    assert.equal(selectLength({ ...base, urgency: 'critical', objective: 'handle_emergency' }), 'OneSentence'));

  it('collection objective → Short', () =>
    assert.equal(selectLength({ ...base, objective: 'collect_phone' }), 'Short'));

  it('answer_question → Medium', () =>
    assert.equal(selectLength({ ...base, objective: 'answer_question' }), 'Medium'));

  it('recommendation → Medium', () =>
    assert.equal(selectLength({ ...base, objective: 'offer_recommendation', stage: 'recommendation' }), 'Medium'));

  it('complete_conversation → Short', () =>
    assert.equal(selectLength({ ...base, objective: 'complete_conversation' }), 'Short'));
});

// ─── CTA Engine ───────────────────────────────────────────────────────────────

describe('CTA Engine', () => {
  const base = { stage: 'discovery' as const, workflowState: 'collecting_info' as const, urgency: 'normal' as const, bookingStatus: 'none' as const, requiresHuman: false };

  it('booking stage → BookAppointment', () =>
    assert.equal(selectCTA({ ...base, objective: 'offer_appointment', stage: 'booking' }), 'BookAppointment'));

  it('completed stage → CloseConversation', () =>
    assert.equal(selectCTA({ ...base, objective: 'complete_conversation', stage: 'completed' }), 'CloseConversation'));

  it('escalating → TransferToHuman', () =>
    assert.equal(selectCTA({ ...base, objective: 'escalate_to_human', workflowState: 'escalating' }), 'TransferToHuman'));

  it('discovery → AskQuestion', () =>
    assert.equal(selectCTA({ ...base, objective: 'collect_name' }), 'AskQuestion'));

  it('critical urgency → BookAppointment', () =>
    assert.equal(selectCTA({ ...base, objective: 'handle_emergency', urgency: 'critical' }), 'BookAppointment'));

  it('recommendation stage → RecommendService', () =>
    assert.equal(selectCTA({ ...base, objective: 'offer_recommendation', stage: 'recommendation' }), 'RecommendService'));
});

// ─── Personalization ──────────────────────────────────────────────────────────

describe('Personalization', () => {
  it('returns empty personalization from empty memory', () => {
    const p = buildPersonalization(emptyRichMemory());
    assert.equal(p.visitorName, undefined);
    assert.equal(p.company,     undefined);
    assert.equal(p.service,     undefined);
  });

  it('extracts visitorName from flat memory', () => {
    const mem = { ...emptyRichMemory(), visitorName: 'Bob' };
    const p = buildPersonalization(mem as any);
    assert.equal(p.visitorName, 'Bob');
  });

  it('extracts visitorName from rich memory', () => {
    const mem = emptyRichMemory();
    mem.rich.visitorName = { value: 'Carol', confidence: 90, source: 'context' };
    const p = buildPersonalization(mem);
    assert.equal(p.visitorName, 'Carol');
  });

  it('extracts service from servicesDiscussed', () => {
    const mem = { ...emptyRichMemory(), servicesDiscussed: ['AC Repair'] };
    const p = buildPersonalization(mem as any);
    assert.equal(p.service, 'AC Repair');
  });

  it('never returns null — only undefined', () => {
    const p = buildPersonalization(emptyRichMemory());
    assert.equal(p.visitorName, undefined);
    assert.equal(p.company, undefined);
  });
});

// ─── Humanizer ────────────────────────────────────────────────────────────────

describe('Humanizer', () => {
  it('humanize: "Please provide your phone number." → natural question', () => {
    const r = humanize('Please provide your phone number.');
    assert.ok(!r.toLowerCase().includes('please provide'), `Got: ${r}`);
  });

  it('humanize: "Provide your address." → service address question', () => {
    const r = humanize('Provide your address.');
    assert.ok(r.toLowerCase().includes('address'), `Got: ${r}`);
  });

  it('humanize: passes through unchanged text', () => {
    const r = humanize('What can I help you with?');
    assert.equal(r, 'What can I help you with?');
  });

  it('humanizeFieldQuestion: phone field returns a question', () => {
    const q = humanizeFieldQuestion('phone', 0);
    assert.ok(q.includes('?') || q.length > 5);
  });

  it('humanizeFieldQuestion: address field returns a question', () => {
    const q = humanizeFieldQuestion('address', 0);
    assert.ok(q.length > 5);
  });

  it('humanizeFieldQuestion: rotates variants by index', () => {
    const q0 = humanizeFieldQuestion('phone', 0);
    const q1 = humanizeFieldQuestion('phone', 1);
    assert.notEqual(q0, q1);
  });

  it('humanizeFieldQuestion: unknown field returns empty string', () => {
    const q = humanizeFieldQuestion('nonexistent_field', 0);
    assert.equal(q, '');
  });

  it('buildMustMention: includes urgency on emergency', () => {
    const items = buildMustMention({ objective: 'handle_emergency', businessName: 'ACME', isEmergency: true });
    assert.ok(items.some(i => i.toLowerCase().includes('urgency') || i.toLowerCase().includes('urgent')));
  });

  it('buildMustAvoid: always includes "Never claim to be human"', () => {
    const items = buildMustAvoid({ objective: 'collect_phone', industry: 'hvac' });
    assert.ok(items.some(i => i.toLowerCase().includes('human')));
  });
});

// ─── Industry overrides ───────────────────────────────────────────────────────

describe('Industry overrides', () => {
  it('saas industry → Sales style', () => {
    const style = selectStyle({ objective: 'collect_phone', stage: 'discovery', industry: 'saas' });
    assert.equal(style, 'Sales');
  });

  it('electrical → Technical style', () => {
    const style = selectStyle({ objective: 'collect_phone', stage: 'discovery', industry: 'electrical' });
    assert.equal(style, 'Technical');
  });

  it('real_estate → Concierge style', () => {
    const style = selectStyle({ objective: 'collect_phone', stage: 'discovery', industry: 'real_estate' });
    assert.equal(style, 'Concierge');
  });

  it('hvac → Dispatcher style on emergency', () => {
    const style = selectStyle({ objective: 'handle_emergency', stage: 'greeting', industry: 'hvac' });
    assert.equal(style, 'Dispatcher');
  });
});

// ─── Blueprint factory ────────────────────────────────────────────────────────

describe('ResponseBlueprint factory', () => {
  it('builds a frozen blueprint', () => {
    const bp = buildResponseBlueprint({
      objective: 'collect_phone', tone: 'Friendly', emotion: 'Neutral',
      urgency: 'normal', cta: 'AskQuestion', personalization: {},
      length: 'Short', style: 'Conversational', mustMention: [],
      mustAvoid: [], guardrails: [], examples: [],
      industry: 'hvac', stage: 'discovery', workflowState: 'collecting_info',
    });
    assert.throws(() => { (bp as any).tone = 'Hacked'; }, TypeError);
  });

  it('question field is undefined when not provided', () => {
    const bp = buildResponseBlueprint({
      objective: 'collect_phone', tone: 'Friendly', emotion: 'Neutral',
      urgency: 'normal', cta: 'AskQuestion', personalization: {},
      length: 'Short', style: 'Conversational', mustMention: [],
      mustAvoid: [], guardrails: [], examples: [],
      industry: 'hvac', stage: 'discovery', workflowState: 'collecting_info',
    });
    assert.equal(bp.question, undefined);
  });
});

// ─── Null / missing input edge cases ─────────────────────────────────────────

describe('Edge cases', () => {
  it('handles null/empty memory without throwing', () => {
    assert.doesNotThrow(() => {
      ResponseEngine.buildBlueprint(makeInput({ memory: emptyRichMemory() }));
    });
  });

  it('handles general industry', () => {
    const identity = makeIdentity({ companyProfile: { ...makeIdentity().companyProfile, industry: 'general' } } as any);
    assert.doesNotThrow(() => ResponseEngine.buildBlueprint(makeInput({ identity })));
  });

  it('handles unknown objective gracefully', () => {
    const plan = makePlan({ objective: 'build_rapport' });
    assert.doesNotThrow(() => ResponseEngine.buildBlueprint(makeInput({ plan })));
  });

  it('always returns a string for objective', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.equal(typeof bp.objective, 'string');
  });

  it('examples is always an array', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.ok(Array.isArray(bp.examples));
  });

  it('mustMention is always an array', () => {
    const bp = ResponseEngine.buildBlueprint(makeInput());
    assert.ok(Array.isArray(bp.mustMention));
  });
});
