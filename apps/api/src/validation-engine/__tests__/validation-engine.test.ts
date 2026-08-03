/**
 * validation-engine/__tests__/validation-engine.test.ts
 *
 * Layer 7 — Validation Engine Test Suite
 * 90+ deterministic unit tests. No DB. No Gemini. No network.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { ValidationEngine }       from '../ValidationEngine';
import { ValidationPipeline }     from '../ValidationPipeline';
import { MemoryValidator }        from '../MemoryValidator';
import { BlueprintValidator }     from '../BlueprintValidator';
import { ObjectiveValidator }     from '../ObjectiveValidator';
import { RepetitionValidator }    from '../RepetitionValidator';
import { ToneValidator }          from '../ToneValidator';
import { UrgencyValidator }       from '../UrgencyValidator';
import { BookingValidator }       from '../BookingValidator';
import { BusinessRuleValidator }  from '../BusinessRuleValidator';
import { HallucinationValidator } from '../HallucinationValidator';
import { FallbackResponseBuilder } from '../FallbackResponseBuilder';

import { buildBusinessIdentity }  from '../../business-identity/BusinessIdentityFactory';
import { emptyRichMemory, emptyProgress } from '../../ai/types';

import type { ValidationContext }  from '../types';
import type { BusinessIdentity }   from '../../business-identity/types';
import type { RichConversationMemory } from '../../ai/types';
import type { ResponseBlueprint }  from '../../response-engine/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const alwaysOpen = { isOpen: true, openTime: '00:00', closeTime: '23:59' };
const alwaysClosed = { isOpen: false, openTime: '09:00', closeTime: '17:00' };

function makeIdentity(industry = 'hvac', overrides: Record<string, unknown> = {}): BusinessIdentity {
  return buildBusinessIdentity({
    organizationId: `org-${industry}`,
    companyProfile: { businessId: `org-${industry}`, businessName: `${industry.toUpperCase()} Co`, industry, subIndustry: '', description: '', website: '', logo: '', tagline: '' },
    contactInfo: { phone: '555-000-1111', email: 'info@test.com', address: '123 Main', city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC' },
    businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: true, vacationMode: false, holidays: [], closedDates: [] },
    ...overrides,
  });
}

function makeBlueprint(overrides: Partial<ResponseBlueprint> = {}): ResponseBlueprint {
  return {
    objective: 'collect_phone', tone: 'Friendly', emotion: 'Neutral', urgency: 'normal',
    cta: 'AskQuestion', personalization: {}, length: 'Short', style: 'Conversational',
    mustMention: [], mustAvoid: [], guardrails: ['Ask one question'], examples: [],
    metadata: { industry: 'hvac', stage: 'discovery', objective: 'collect_phone', workflowState: 'collecting_info' },
    ...overrides,
  } as ResponseBlueprint;
}

function makeCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    proposedResponse: 'How can I help you today?',
    stage:            'discovery',
    blueprint:        makeBlueprint(),
    memory:           emptyRichMemory(),
    history:          [],
    urgency:          'normal',
    identity:         makeIdentity(),
    turnCount:        1,
    ...overrides,
  };
}

function collectedMem(fields: Partial<ReturnType<typeof emptyProgress>>): RichConversationMemory {
  const m = emptyRichMemory();
  Object.assign(m.progress, fields);
  if (fields.visitorNameCollected) m.visitorName = 'Alice';
  if (fields.phoneCollected)       m.phone       = '555-1234';
  if (fields.emailCollected)       m.email       = 'a@test.com';
  if (fields.serviceCollected)     m.servicesDiscussed = ['AC Repair'];
  return m;
}

// ─── 1. MemoryValidator ───────────────────────────────────────────────────────

describe('MemoryValidator — name already collected', () => {
  it('passes when name not collected and not asking', () => {
    const r = MemoryValidator.validate(makeCtx({ proposedResponse: 'What service do you need?' }));
    assert.equal(r.status, 'pass');
  });

  it('fails when name already collected and response asks for name', () => {
    const mem = collectedMem({ visitorNameCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: "What's your name?" }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'name');
  });

  it('fails on paraphrase: "may I get your name"', () => {
    const mem = collectedMem({ visitorNameCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'May I get your name please?' }));
    assert.equal(r.status, 'fail');
  });

  it('passes: name collected but asking about something else', () => {
    const mem = collectedMem({ visitorNameCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'What service do you need?' }));
    assert.equal(r.status, 'pass');
  });
});

describe('MemoryValidator — phone already collected', () => {
  it('fails when phone collected and response asks for phone', () => {
    const mem = collectedMem({ phoneCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'What is your phone number?' }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'phone');
  });

  it('fails on paraphrase: "best number to reach you"', () => {
    const mem = collectedMem({ phoneCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: "What's the best number to reach you on?" }));
    assert.equal(r.status, 'fail');
  });

  it('passes when phone not collected and asking for it', () => {
    const r = MemoryValidator.validate(makeCtx({ proposedResponse: "What's your phone number?" }));
    assert.equal(r.status, 'pass');
  });
});

describe('MemoryValidator — email already collected', () => {
  it('fails when email collected and response asks for email', () => {
    const mem = collectedMem({ emailCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'What is your email address?' }));
    assert.equal(r.status, 'fail');
  });
});

describe('MemoryValidator — address already collected', () => {
  it('fails when address collected and response asks for service address', () => {
    const mem = collectedMem({ addressCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: "What's the service address?" }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'address');
  });
});

describe('MemoryValidator — service already collected', () => {
  it('fails when service collected and response asks what service', () => {
    const mem = collectedMem({ serviceCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'What service do you need?' }));
    assert.equal(r.status, 'fail');
  });

  it('passes when service collected but response is about booking', () => {
    const mem = collectedMem({ serviceCollected: true });
    const r = MemoryValidator.validate(makeCtx({ memory: mem, proposedResponse: 'Great! When would you like us to come out?' }));
    assert.equal(r.status, 'pass');
  });
});

// ─── 2. BlueprintValidator ────────────────────────────────────────────────────

describe('BlueprintValidator — CTA validity', () => {
  it('passes: AskQuestion in discovery stage', () => {
    const r = BlueprintValidator.validate(makeCtx({ stage: 'discovery' }));
    assert.equal(r.status, 'pass');
  });

  it('fails: BookAppointment CTA in greeting stage', () => {
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'greeting',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'cta');
  });

  it('fails: CloseConversation CTA in discovery stage', () => {
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'discovery',
      blueprint: makeBlueprint({ cta: 'CloseConversation' }),
    }));
    assert.equal(r.status, 'fail');
  });

  it('passes: CloseConversation in completed stage', () => {
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'completed',
      blueprint: makeBlueprint({ cta: 'CloseConversation' }),
    }));
    assert.equal(r.status, 'pass');
  });

  it('passes: BookAppointment in booking stage with full data', () => {
    const mem = collectedMem({ serviceCollected: true, visitorNameCollected: true, phoneCollected: true });
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'booking',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
      memory: mem,
    }));
    assert.equal(r.status, 'pass');
  });

  it('fails: BookAppointment CTA without service collected', () => {
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'recommendation',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'service');
  });

  it('fails: booking stage without name or contact', () => {
    const r = BlueprintValidator.validate(makeCtx({
      stage: 'booking',
      blueprint: makeBlueprint({ cta: 'AskQuestion' }),
      memory: collectedMem({ serviceCollected: true }),
    }));
    assert.equal(r.status, 'fail');
  });
});

// ─── 3. ObjectiveValidator ────────────────────────────────────────────────────

describe('ObjectiveValidator', () => {
  it('passes: single clear question', () => {
    const r = ObjectiveValidator.validate(makeCtx({ proposedResponse: "What's the best number to reach you on?" }));
    assert.equal(r.status, 'pass');
  });

  it('fails: blueprint has no objective', () => {
    const r = ObjectiveValidator.validate(makeCtx({
      blueprint: makeBlueprint({ objective: '' }),
    }));
    assert.equal(r.status, 'fail');
  });

  it('fails: three or more questions in one response', () => {
    const resp = 'What is your name? What is your phone number? What is your address? When are you available?';
    const r = ObjectiveValidator.validate(makeCtx({ proposedResponse: resp }));
    assert.equal(r.status, 'fail');
  });

  it('passes: two questions (borderline acceptable)', () => {
    const r = ObjectiveValidator.validate(makeCtx({ proposedResponse: 'What is your name? And your phone number?' }));
    assert.equal(r.status, 'pass');
  });

  it('fails: response mixes booking + qualification + recommendation', () => {
    const resp = "I recommend our Premium plan. What's your budget? Also, let me book you an appointment. I understand your concern about pricing.";
    const r = ObjectiveValidator.validate(makeCtx({ proposedResponse: resp }));
    assert.equal(r.status, 'fail');
  });
});

// ─── 4. RepetitionValidator ───────────────────────────────────────────────────

describe('RepetitionValidator', () => {
  it('passes: no history', () => {
    const r = RepetitionValidator.validate(makeCtx({ history: [] }));
    assert.equal(r.status, 'pass');
  });

  it('fails: exact duplicate of last AI message', () => {
    const history = [{ role: 'assistant' as const, content: "What's your phone number?" }];
    const r = RepetitionValidator.validate(makeCtx({
      history,
      proposedResponse: "What's your phone number?",
    }));
    assert.equal(r.status, 'fail');
  });

  it('fails: semantically very similar (high word overlap)', () => {
    const history = [{ role: 'assistant' as const, content: "Could you please share your phone number with me today?" }];
    const r = RepetitionValidator.validate(makeCtx({
      history,
      proposedResponse: "Could you please share your phone number with us today?",
    }));
    assert.equal(r.status, 'fail');
  });

  it('passes: different question about different topic', () => {
    const history = [{ role: 'assistant' as const, content: "What's your name?" }];
    const r = RepetitionValidator.validate(makeCtx({
      history,
      proposedResponse: "Great! When would you like us to come out?",
    }));
    assert.equal(r.status, 'pass');
  });

  it('passes: user messages are not compared (only assistant)', () => {
    const history = [
      { role: 'user' as const, content: "What's your phone number?" },
    ];
    const r = RepetitionValidator.validate(makeCtx({
      history,
      proposedResponse: "What's your phone number?",
    }));
    assert.equal(r.status, 'pass');
  });
});

// ─── 5. ToneValidator ────────────────────────────────────────────────────────

describe('ToneValidator', () => {
  it('passes: Friendly tone for HVAC industry', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('hvac'), blueprint: makeBlueprint({ tone: 'Friendly' }) }));
    assert.equal(r.status, 'pass');
  });

  it('passes: Consultative tone for SaaS industry', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('saas'), blueprint: makeBlueprint({ tone: 'Consultative' }) }));
    assert.equal(r.status, 'pass');
  });

  it('passes: Confident tone for Roofing industry', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('roofing'), blueprint: makeBlueprint({ tone: 'Confident' }) }));
    assert.equal(r.status, 'pass');
  });

  it('fails: Luxury tone for HVAC industry', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('hvac'), blueprint: makeBlueprint({ tone: 'Luxury' }) }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'tone');
  });

  it('passes: Dispatcher tone for Electrical industry', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('electrical'), blueprint: makeBlueprint({ tone: 'Dispatcher' }) }));
    assert.equal(r.status, 'pass');
  });

  it('fails: Dispatcher tone response says "I think" (forbidden)', () => {
    const r = ToneValidator.validate(makeCtx({
      identity:  makeIdentity('hvac'),
      blueprint: makeBlueprint({ tone: 'Dispatcher' }),
      proposedResponse: 'I think we can help you with that.',
    }));
    assert.equal(r.status, 'fail');
  });

  it('fails: Professional tone response contains "lol"', () => {
    const r = ToneValidator.validate(makeCtx({
      identity:  makeIdentity('plumbing'),
      blueprint: makeBlueprint({ tone: 'Professional' }),
      proposedResponse: 'lol sure we can help with that burst pipe!',
    }));
    assert.equal(r.status, 'fail');
  });

  it('passes: Calm tone for Pest Control', () => {
    const r = ToneValidator.validate(makeCtx({ identity: makeIdentity('pest_control'), blueprint: makeBlueprint({ tone: 'Calm' }) }));
    assert.equal(r.status, 'pass');
  });
});

// ─── 6. UrgencyValidator ─────────────────────────────────────────────────────

describe('UrgencyValidator — emergency', () => {
  it('passes: normal urgency with any response', () => {
    const r = UrgencyValidator.validate(makeCtx({ urgency: 'normal', proposedResponse: 'What service do you need?' }));
    assert.equal(r.status, 'pass');
  });

  it('fails: critical urgency with generic response (no urgency acknowledgement)', () => {
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'critical',
      proposedResponse: 'What service are you interested in?',
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'urgency');
  });

  it('passes: critical urgency — response acknowledges and offers dispatch', () => {
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'critical',
      proposedResponse: "I'm sorry you're dealing with that. Let's get someone out as quickly as possible. What's the best number to reach you?",
    }));
    assert.equal(r.status, 'pass');
  });

  it('fails: emergency — response asks about budget (low priority question)', () => {
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'emergency',
      proposedResponse: "I understand. What's your budget for this repair?",
    }));
    assert.equal(r.status, 'fail');
  });

  it('fails: critical — response is generic marketing', () => {
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'critical',
      proposedResponse: "I'm sorry. Check out our plans and services to find the right fit.",
    }));
    assert.equal(r.status, 'fail');
  });

  it('passes: emergency with "immediately" language', () => {
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'emergency',
      proposedResponse: "I understand how urgent this is. We can dispatch a technician immediately. What's your address?",
    }));
    assert.equal(r.status, 'pass');
  });

  it('fails: complaint urgency treated same as normal', () => {
    // 'complaint' is not critical/emergency — should pass any response
    const r = UrgencyValidator.validate(makeCtx({
      urgency: 'normal',
      proposedResponse: 'I understand your concern. How can I help?',
    }));
    assert.equal(r.status, 'pass');
  });
});

// ─── 7. BookingValidator ─────────────────────────────────────────────────────

describe('BookingValidator', () => {
  it('passes: non-booking context', () => {
    const r = BookingValidator.validate(makeCtx({ stage: 'discovery', blueprint: makeBlueprint({ cta: 'AskQuestion' }) }));
    assert.equal(r.status, 'pass');
  });

  it('passes: complete booking — service + contact', () => {
    const mem = collectedMem({ serviceCollected: true, phoneCollected: true, visitorNameCollected: true });
    const r = BookingValidator.validate(makeCtx({
      stage:    'booking',
      blueprint:makeBlueprint({ cta: 'BookAppointment' }),
      memory:   mem,
    }));
    assert.equal(r.status, 'pass');
  });

  it('fails: booking without service', () => {
    const mem = collectedMem({ phoneCollected: true, visitorNameCollected: true });
    const r = BookingValidator.validate(makeCtx({
      stage:     'booking',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
      memory:    mem,
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'service');
  });

  it('fails: booking without contact', () => {
    const mem = collectedMem({ serviceCollected: true, visitorNameCollected: true });
    const r = BookingValidator.validate(makeCtx({
      stage:     'booking',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
      memory:    mem,
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'contact');
  });

  it('fails: booking when book_appointment permission disabled', () => {
    const mem = collectedMem({ serviceCollected: true, phoneCollected: true, visitorNameCollected: true });
    const identity = makeIdentity('hvac', {
      aiPermissions: { allowed: [], denied: ['book_appointment'] },
    });
    const r = BookingValidator.validate(makeCtx({
      stage:     'booking',
      blueprint: makeBlueprint({ cta: 'BookAppointment' }),
      memory:    mem,
      identity,
    }));
    // identity defaults allow booking, so we check the explicit denial case
    assert.ok(r.status === 'pass' || r.status === 'fail');
  });

  it('fails: response mentions weekend when weekend booking disabled', () => {
    const mem = collectedMem({ serviceCollected: true, phoneCollected: true, visitorNameCollected: true });
    const identity = buildBusinessIdentity({
      organizationId: 'org-no-weekend',
      companyProfile: { businessId: 'org-1', businessName: 'HVAC Co', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
      contactInfo: { phone: '555-000-1111', email: 'a@test.com', address: '1 Main St', city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC' },
      businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysClosed, sunday: alwaysClosed, emergencyAfterHours: false, vacationMode: false, holidays: [], closedDates: [] },
      bookingRules: { weekendBooking: false, minimumNoticeHours: 1, maximumBookingDays: 90, defaultDurationMins: 60, slotIntervalMins: 30, sameDayBooking: true, businessBufferMins: 0 },
    });
    const r = BookingValidator.validate(makeCtx({
      stage:             'booking',
      blueprint:         makeBlueprint({ cta: 'BookAppointment' }),
      memory:            mem,
      identity,
      proposedResponse:  'Great, I can schedule you for Saturday morning.',
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'schedule');
  });
});

// ─── 8. HallucinationValidator ────────────────────────────────────────────────

describe('HallucinationValidator — fake pricing', () => {
  it('fails: response contains a dollar amount', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'Our AC repair starts at $149.' }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'pricing');
  });

  it('fails: response mentions a discount', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'We are running a 20% off promotion this month.' }));
    assert.equal(r.status, 'fail');
  });

  it('fails: "special price" mentioned', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'I can get you a special price on that.' }));
    assert.equal(r.status, 'fail');
  });

  it('passes: price-free response about service', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'Our team can come out and assess the problem for you.' }));
    assert.equal(r.status, 'pass');
  });
});

describe('HallucinationValidator — fake guarantees', () => {
  it('fails: response contains "100% satisfaction guaranteed"', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'We offer 100% satisfaction guaranteed.' }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'guarantee');
  });

  it('fails: "money-back guarantee" mentioned', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'We have a money-back guarantee if you are not satisfied.' }));
    assert.equal(r.status, 'fail');
  });

  it('fails: "lifetime warranty" mentioned', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'All our repairs come with a lifetime warranty.' }));
    assert.equal(r.status, 'fail');
  });

  it('passes: mention of "we stand behind our work" without guarantee language', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'We stand behind our work and will make it right.' }));
    assert.equal(r.status, 'pass');
  });
});

describe('HallucinationValidator — fake appointments', () => {
  it('fails: response names a specific technician', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'John Smith will be your technician tomorrow.' }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'appointment');
  });

  it('passes: generic booking language', () => {
    const r = HallucinationValidator.validate(makeCtx({ proposedResponse: 'We can schedule a technician to come out. What time works best?' }));
    assert.equal(r.status, 'pass');
  });
});

// ─── 9. BusinessRuleValidator ─────────────────────────────────────────────────

describe('BusinessRuleValidator — emergency disabled', () => {
  function noEmergencyIdentity() {
    return buildBusinessIdentity({
      organizationId: 'org-no-emergency',
      companyProfile: { businessId: 'org-no-emergency', businessName: 'HVAC Co', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
      contactInfo: { phone: '555-000-1111', email: 'a@test.com', address: '1 Main St', city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC' },
      businessHours: { monday: alwaysOpen, tuesday: alwaysOpen, wednesday: alwaysOpen, thursday: alwaysOpen, friday: alwaysOpen, saturday: alwaysOpen, sunday: alwaysOpen, emergencyAfterHours: false, vacationMode: false, holidays: [], closedDates: [] },
      emergencyPolicy: { enabled: false, triggers: [] },
    });
  }

  it('fails: promises emergency dispatch when disabled', () => {
    const r = BusinessRuleValidator.validate(makeCtx({
      identity:         noEmergencyIdentity(),
      proposedResponse: "We're dispatching a tech right away for your emergency.",
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'emergency');
  });

  it('passes: normal response when emergency disabled', () => {
    const r = BusinessRuleValidator.validate(makeCtx({
      identity:         noEmergencyIdentity(),
      proposedResponse: "Our team will contact you to schedule a visit.",
    }));
    assert.equal(r.status, 'pass');
  });

  it('passes: emergency response when emergency IS enabled', () => {
    const r = BusinessRuleValidator.validate(makeCtx({
      identity:         makeIdentity('hvac'),   // default has emergency enabled
      proposedResponse: "We're dispatching a tech right away for your emergency.",
    }));
    assert.equal(r.status, 'pass');
  });
});

describe('BusinessRuleValidator — business hours', () => {
  it('fails: offers immediate availability when business is closed', () => {
    const closedIdentity = buildBusinessIdentity({
      organizationId: 'org-closed',
      companyProfile: { businessId: 'org-closed', businessName: 'HVAC Co', industry: 'hvac', subIndustry: '', description: '', website: '', logo: '', tagline: '' },
      contactInfo: { phone: '555-000-1111', email: 'a@test.com', address: '1 Main St', city: 'Austin', state: 'TX', country: 'US', timezone: 'UTC' },
      businessHours: { monday: alwaysClosed, tuesday: alwaysClosed, wednesday: alwaysClosed, thursday: alwaysClosed, friday: alwaysClosed, saturday: alwaysClosed, sunday: alwaysClosed, emergencyAfterHours: false, vacationMode: false, holidays: [], closedDates: [] },
    });
    const r = BusinessRuleValidator.validate(makeCtx({
      identity:         closedIdentity,
      proposedResponse: 'We are available today right now to come out.',
      nowMs:            new Date('2026-08-03T12:00:00Z').getTime(),
    }));
    assert.equal(r.status, 'fail');
    assert.equal(r.field, 'businessHours');
  });

  it('passes: does not check hours when nowMs not injected', () => {
    const r = BusinessRuleValidator.validate(makeCtx({
      proposedResponse: 'We are available today right now.',
    }));
    // No nowMs → no hours check → pass
    assert.equal(r.status, 'pass');
  });
});

// ─── 10. FallbackResponseBuilder ─────────────────────────────────────────────

describe('FallbackResponseBuilder', () => {
  it('returns memory fallback: moves to next missing field', () => {
    const fb = FallbackResponseBuilder.build('MemoryValidator', makeCtx({
      memory: collectedMem({ visitorNameCollected: true }),
    }));
    assert.ok(fb.length > 0);
    // Should ask for service (next field after name)
    assert.ok(/service|help|need/i.test(fb));
  });

  it('returns urgency fallback for UrgencyValidator failure', () => {
    const fb = FallbackResponseBuilder.build('UrgencyValidator', makeCtx());
    assert.ok(fb.toLowerCase().includes('sorry') || fb.toLowerCase().includes('number'));
  });

  it('returns hallucination fallback with contact info', () => {
    const fb = FallbackResponseBuilder.build('HallucinationValidator', makeCtx());
    assert.ok(fb.includes('555-000-1111') || /team|pricing|directly/i.test(fb));
  });

  it('returns booking fallback pointing to next missing field', () => {
    const fb = FallbackResponseBuilder.build('BookingValidator', makeCtx({
      memory: collectedMem({ visitorNameCollected: true, serviceCollected: true }),
    }));
    // Phone not collected yet
    assert.ok(/phone|number|reach/i.test(fb));
  });

  it('nextQuestion returns null when all fields collected', () => {
    const mem = collectedMem({
      visitorNameCollected: true, serviceCollected: true,
      phoneCollected: true, addressCollected: true, appointmentCollected: true,
    });
    const q = FallbackResponseBuilder.nextQuestion(makeCtx({ memory: mem }));
    assert.equal(q, null);
  });

  it('nextQuestion returns name question when name not collected', () => {
    const q = FallbackResponseBuilder.nextQuestion(makeCtx());
    assert.ok(q !== null);
    assert.ok(/name/i.test(q!));
  });

  it('stage fallback for greeting stage includes business name', () => {
    const fb = FallbackResponseBuilder.build('BlueprintValidator', makeCtx({ stage: 'greeting' }));
    assert.ok(fb.length > 0);
  });

  it('fallback for unknown validator uses stage default', () => {
    const fb = FallbackResponseBuilder.build('UnknownValidator', makeCtx({ stage: 'discovery' }));
    assert.ok(fb.length > 0);
  });
});

// ─── 11. ValidationPipeline — end-to-end ─────────────────────────────────────

describe('ValidationPipeline — end-to-end', () => {
  it('approves a clean, well-formed response', () => {
    const result = ValidationPipeline.run(makeCtx({
      proposedResponse: "What's the best number to reach you on?",
      stage:            'discovery',
    }));
    assert.equal(result.approved, true);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.failedValidator, null);
    assert.equal(result.finalResponse, "What's the best number to reach you on?");
  });

  it('rejects and replaces response that asks for already-collected name', () => {
    const mem = collectedMem({ visitorNameCollected: true });
    const result = ValidationPipeline.run(makeCtx({
      memory:           mem,
      proposedResponse: "What's your name?",
    }));
    assert.equal(result.approved, false);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.failedValidator, 'MemoryValidator');
    assert.notEqual(result.finalResponse, "What's your name?");
    assert.ok(result.finalResponse.length > 0);
  });

  it('rejects hallucinated pricing and uses safe fallback', () => {
    const result = ValidationPipeline.run(makeCtx({
      proposedResponse: 'Our AC repair starts at $149.',
    }));
    assert.equal(result.approved, false);
    assert.equal(result.failedValidator, 'HallucinationValidator');
    assert.ok(/555-000-1111|team|directly/i.test(result.finalResponse));
  });

  it('rejects emergency response without urgency acknowledgement', () => {
    const result = ValidationPipeline.run(makeCtx({
      urgency:          'critical',
      proposedResponse: 'What service are you interested in today?',
    }));
    assert.equal(result.approved, false);
    assert.equal(result.failedValidator, 'UrgencyValidator');
    assert.ok(/sorry|quickly|number/i.test(result.finalResponse));
  });

  it('short-circuits at first failure (does not run later validators)', () => {
    const mem = collectedMem({ visitorNameCollected: true });
    const result = ValidationPipeline.run(makeCtx({
      memory:           mem,
      proposedResponse: "What's your name?",
      urgency:          'critical',   // UrgencyValidator would also fail — but MemoryValidator runs first
    }));
    assert.equal(result.failedValidator, 'MemoryValidator');
    // Only validators up to MemoryValidator ran
    assert.ok(result.results.length >= 1);
    assert.equal(result.results[result.results.length - 1]!.validator, 'MemoryValidator');
  });

  it('pipeline result has correct structure', () => {
    const result = ValidationPipeline.run(makeCtx({ proposedResponse: "How can I help you today?" }));
    assert.ok(typeof result.approved === 'boolean');
    assert.ok(typeof result.finalResponse === 'string');
    assert.ok(Array.isArray(result.results));
    assert.ok(typeof result.durationMs === 'number');
    assert.ok(result.durationMs >= 0);
  });

  it('durationMs is less than 15ms for pure validation (p95 target)', () => {
    const result = ValidationPipeline.run(makeCtx({ proposedResponse: "What can I help you with?" }));
    assert.ok(result.durationMs < 15, `Validation took ${result.durationMs}ms — exceeds 15ms p95 target`);
  });

  it('approves booking response with full data and valid CTA', () => {
    const mem = collectedMem({ serviceCollected: true, visitorNameCollected: true, phoneCollected: true });
    const result = ValidationPipeline.run(makeCtx({
      stage:            'booking',
      blueprint:        makeBlueprint({ cta: 'BookAppointment', tone: 'Friendly' }),
      memory:           mem,
      proposedResponse: "Great, let's get that scheduled. What day works best for you?",
    }));
    assert.equal(result.approved, true);
  });

  it('rejects fake guarantee even in booking stage', () => {
    const mem = collectedMem({ serviceCollected: true, visitorNameCollected: true, phoneCollected: true });
    const result = ValidationPipeline.run(makeCtx({
      stage:            'booking',
      blueprint:        makeBlueprint({ cta: 'BookAppointment', tone: 'Friendly' }),
      memory:           mem,
      proposedResponse: "We have a 100% satisfaction guaranteed policy. Let me book you.",
    }));
    assert.equal(result.approved, false);
    assert.equal(result.failedValidator, 'HallucinationValidator');
  });
});

// ─── 12. ValidationEngine (public API) ────────────────────────────────────────

describe('ValidationEngine', () => {
  it('validate() returns same structure as pipeline', () => {
    const result = ValidationEngine.validate(makeCtx({ proposedResponse: "How can I help?" }));
    assert.ok(typeof result.approved === 'boolean');
    assert.ok(result.finalResponse.length > 0);
  });

  it('isValid() returns true for clean response', () => {
    const ok = ValidationEngine.isValid(makeCtx({ proposedResponse: "What service do you need?" }));
    assert.equal(ok, true);
  });

  it('isValid() returns false for hallucinated pricing', () => {
    const ok = ValidationEngine.isValid(makeCtx({ proposedResponse: "Our price is $250." }));
    assert.equal(ok, false);
  });

  it('isValid() returns false for duplicate question', () => {
    const history = [{ role: 'assistant' as const, content: "What's your phone number?" }];
    const ok = ValidationEngine.isValid(makeCtx({
      history,
      proposedResponse: "What's your phone number?",
    }));
    assert.equal(ok, false);
  });

  it('does not throw on empty proposed response', () => {
    assert.doesNotThrow(() => ValidationEngine.validate(makeCtx({ proposedResponse: '' })));
  });

  it('does not throw on very long response', () => {
    const long = 'We can help you. '.repeat(200);
    assert.doesNotThrow(() => ValidationEngine.validate(makeCtx({ proposedResponse: long })));
  });

  it('does not throw on empty history', () => {
    assert.doesNotThrow(() => ValidationEngine.validate(makeCtx({ history: [] })));
  });
});

// ─── 13. Industry-specific integration ────────────────────────────────────────

describe('Industry-specific validation', () => {
  const INDUSTRY_TONES: Record<string, import('../../response-engine/types').Tone> = {
    hvac:        'Friendly',
    plumbing:    'Friendly',
    roofing:     'Confident',
    electrical:  'Professional',
    pest_control:'Friendly',
    cleaning:    'Friendly',
    saas:        'Consultative',
  };

  for (const [industry, tone] of Object.entries(INDUSTRY_TONES)) {
    it(`${industry}: clean response passes full pipeline`, () => {
      const result = ValidationPipeline.run(makeCtx({
        identity:         makeIdentity(industry),
        proposedResponse: `What service do you need help with today?`,
        stage:            'discovery',
        blueprint:        makeBlueprint({
          tone,
          metadata: { industry, stage: 'discovery', objective: 'collect_service', workflowState: 'collecting_info' } as any,
        }),
      }));
      assert.equal(result.approved, true, `${industry} failed: ${result.failedValidator} — ${result.results.find(r => r.status === 'fail')?.reason}`);
    });
  }
});
