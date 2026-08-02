/**
 * business-identity/__tests__/business-identity.test.ts
 *
 * Unit tests for the Business Identity Engine.
 * Uses Node.js built-in test runner — no external deps.
 * Run: npx tsx src/business-identity/__tests__/business-identity.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBusinessIdentity, parseBusinessIdentity }  from '../BusinessIdentityFactory';
import { servesLocation, isOutsideServiceArea, getTravelFee } from '../modules/service-area.module';
import { listBookableServices, matchServiceFromIntent, getServiceByName } from '../modules/services-catalog.module';
import { isOpen, nextOpeningTime } from '../modules/business-hours.module';
import { detectEmergencyPriority, isEmergency } from '../modules/emergency-policy.module';
import { shouldEscalateOnMessage, shouldEscalateOnScore } from '../modules/escalation-policy.module';
import { isPermitted, isDenied } from '../modules/permissions.module';
import { toPromptDirectives as brandToPrompt } from '../modules/brand-personality.module';
import { renderGreeting, renderSignOff } from '../modules/receptionist-identity.module';
import { toPromptDirectives as rulesToPrompt, isRuleEnabled } from '../modules/conversation-rules.module';
import { BusinessIdentityCache } from '../cache/BusinessIdentityCache';
import type { BusinessIdentity } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMinimalRaw(overrides: Record<string, unknown> = {}): unknown {
  return {
    organizationId: 'org-123',
    companyProfile: {
      businessId:   'org-123',
      businessName: 'Cool Air HVAC',
      industry:     'hvac',
    },
    contactInfo: {
      phone:    '555-000-1111',
      timezone: 'America/New_York',
    },
    businessHours: {
      monday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      tuesday:   { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      wednesday: { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      thursday:  { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      friday:    { isOpen: true,  openTime: '08:00', closeTime: '17:00' },
      saturday:  { isOpen: false, openTime: '09:00', closeTime: '13:00' },
      sunday:    { isOpen: false, openTime: '09:00', closeTime: '13:00' },
    },
    ...overrides,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

describe('BusinessIdentityFactory', () => {
  it('builds a valid identity from minimal input', () => {
    const identity = buildBusinessIdentity(makeMinimalRaw());
    assert.equal(identity.organizationId, 'org-123');
    assert.equal(identity.companyProfile.businessName, 'Cool Air HVAC');
    assert.equal(identity.companyProfile.industry, 'hvac');
    assert.ok(identity.loadedAt instanceof Date);
  });

  it('identity object is frozen (immutable)', () => {
    const identity = buildBusinessIdentity(makeMinimalRaw());
    assert.throws(
      () => { (identity as any).organizationId = 'hacked'; },
      TypeError,
      'frozen object should throw on mutation'
    );
  });

  it('applies schema defaults for optional fields', () => {
    const identity = buildBusinessIdentity(makeMinimalRaw());
    assert.equal(identity.brandPersonality.tone, 'friendly');
    assert.equal(identity.bookingRules.minimumNoticeHours, 1);
    assert.equal(identity.bookingRules.maximumBookingDays, 90);
    assert.equal(identity.emergencyPolicy.enabled, true);
  });

  it('throws ZodError on invalid industry enum', () => {
    assert.throws(() => {
      buildBusinessIdentity(makeMinimalRaw({
        companyProfile: {
          businessId: 'x', businessName: 'X', industry: 'not_real_industry',
        },
      }));
    });
  });

  it('throws ZodError on missing required phone', () => {
    assert.throws(() => {
      buildBusinessIdentity(makeMinimalRaw({
        contactInfo: { timezone: 'America/New_York' },  // phone missing
      }));
    });
  });

  it('parseBusinessIdentity returns success:false on invalid input', () => {
    const result = parseBusinessIdentity({ bad: 'data' });
    assert.equal(result.success, false);
  });

  it('parseBusinessIdentity returns success:true on valid input', () => {
    const result = parseBusinessIdentity(makeMinimalRaw());
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.companyProfile.businessName, 'Cool Air HVAC');
    }
  });
});

// ─── Service area ─────────────────────────────────────────────────────────────

describe('ServiceArea module', () => {
  const area = buildBusinessIdentity(makeMinimalRaw({
    serviceArea: {
      primaryCity: 'Austin',
      cities:      ['Austin', 'Round Rock'],
      zipCodes:    ['78701', '78702'],
      enabled:     true,
    },
  })).serviceArea;

  it('servesLocation matches ZIP code', () => {
    assert.equal(servesLocation(area, '78701'), true);
  });

  it('servesLocation matches city (case-insensitive)', () => {
    assert.equal(servesLocation(area, 'round rock'), true);
  });

  it('servesLocation matches primary city', () => {
    assert.equal(servesLocation(area, 'austin'), true);
  });

  it('servesLocation returns false for unknown location', () => {
    assert.equal(servesLocation(area, '99999'), false);
  });

  it('isOutsideServiceArea is the inverse of servesLocation', () => {
    assert.equal(isOutsideServiceArea(area, '99999'), true);
    assert.equal(isOutsideServiceArea(area, '78701'), false);
  });

  it('servesLocation always returns true when area disabled', () => {
    const openArea = { ...area, enabled: false } as any;
    assert.equal(servesLocation(openArea, 'anywhere'), true);
  });

  it('getTravelFee returns correct fee for distance range', () => {
    const areaWithFees = {
      ...area,
      travelFeeRules: [
        { minMiles: 0,  maxMiles: 10, feeUsd: 0 },
        { minMiles: 10, maxMiles: 30, feeUsd: 25 },
        { minMiles: 30, maxMiles: 60, feeUsd: 50 },
      ],
    } as any;
    assert.equal(getTravelFee(areaWithFees, 15), 25);
    assert.equal(getTravelFee(areaWithFees, 5),  0);
    assert.equal(getTravelFee(areaWithFees, 99), 0);  // no rule applies
  });
});

// ─── Services catalog ─────────────────────────────────────────────────────────

describe('ServicesCatalog module', () => {
  const catalog = [
    { id: '1', name: 'AC Repair',        keywords: ['ac', 'repair', 'cooling'],    emergencyEligible: true,  bookable: true,  estimatedDuration: 90,  enabled: true,  description: '' },
    { id: '2', name: 'Furnace Tune-up',  keywords: ['furnace', 'heating', 'tune'], emergencyEligible: false, bookable: true,  estimatedDuration: 60,  enabled: true,  description: '' },
    { id: '3', name: 'Duct Cleaning',    keywords: ['duct', 'cleaning', 'air'],    emergencyEligible: false, bookable: true,  estimatedDuration: 120, enabled: false, description: '' },
    { id: '4', name: 'Refrigerant Check',keywords: ['refrigerant', 'freon'],       emergencyEligible: false, bookable: false, estimatedDuration: 30,  enabled: true,  description: '' },
  ] as const;

  it('listBookableServices returns only enabled+bookable', () => {
    const bookable = listBookableServices(catalog);
    assert.equal(bookable.length, 2);
    assert.ok(bookable.every(s => s.bookable && s.enabled));
  });

  it('getServiceByName finds exact match case-insensitively', () => {
    const found = getServiceByName(catalog, 'ac repair');
    assert.equal(found?.id, '1');
  });

  it('getServiceByName returns undefined for disabled service', () => {
    assert.equal(getServiceByName(catalog, 'Duct Cleaning'), undefined);
  });

  it('matchServiceFromIntent finds best keyword match', () => {
    const match = matchServiceFromIntent(catalog, 'my heating stopped working furnace');
    assert.equal(match?.id, '2');
  });

  it('matchServiceFromIntent returns undefined when no match', () => {
    assert.equal(matchServiceFromIntent(catalog, 'xyzzy quux'), undefined);
  });
});

// ─── Business hours ───────────────────────────────────────────────────────────

describe('BusinessHours module', () => {
  const hours = buildBusinessIdentity(makeMinimalRaw()).businessHours;
  const tz    = 'America/New_York';

  it('isOpen returns true during business hours on a weekday', () => {
    // Wednesday 10:00 AM ET in 2025
    const wed10am = new Date('2025-07-16T14:00:00Z');   // 14:00 UTC = 10:00 ET
    assert.equal(isOpen(hours, tz, wed10am), true);
  });

  it('isOpen returns false outside business hours', () => {
    // Wednesday 7:00 PM ET
    const wed7pm = new Date('2025-07-16T23:00:00Z');   // 23:00 UTC = 19:00 ET
    assert.equal(isOpen(hours, tz, wed7pm), false);
  });

  it('isOpen returns false on Sunday (closed)', () => {
    // Sunday 11:00 AM ET
    const sun11am = new Date('2025-07-20T15:00:00Z');  // 15:00 UTC = 11:00 ET
    assert.equal(isOpen(hours, tz, sun11am), false);
  });

  it('isOpen returns false in vacation mode', () => {
    const vacMode = { ...hours, vacationMode: true } as any;
    const wed10am = new Date('2025-07-16T14:00:00Z');
    assert.equal(isOpen(vacMode, tz, wed10am), false);
  });

  it('isOpen returns false on a closed date', () => {
    const closed = { ...hours, closedDates: ['2025-07-16'] } as any;
    const wed10am = new Date('2025-07-16T14:00:00Z');
    assert.equal(isOpen(closed, tz, wed10am), false);
  });

  it('nextOpeningTime returns a future Date', () => {
    // Sunday evening — next opening should be Monday morning
    const sunEvening = new Date('2025-07-20T22:00:00Z');
    const next = nextOpeningTime(hours, tz, sunEvening);
    assert.ok(next instanceof Date);
    assert.ok(next > sunEvening);
  });

  it('nextOpeningTime returns null in vacation mode', () => {
    const vacMode = { ...hours, vacationMode: true } as any;
    assert.equal(nextOpeningTime(vacMode, tz), null);
  });
});

// ─── Emergency policy ─────────────────────────────────────────────────────────

describe('EmergencyPolicy module', () => {
  const policy = buildBusinessIdentity(makeMinimalRaw()).emergencyPolicy;

  it('detects critical priority for "no heat"', () => {
    assert.equal(detectEmergencyPriority(policy, 'I have no heat at all'), 'critical');
  });

  it('detects critical priority for "gas leak"', () => {
    assert.equal(detectEmergencyPriority(policy, 'I smell a gas leak'), 'critical');
  });

  it('returns none for non-emergency text', () => {
    assert.equal(detectEmergencyPriority(policy, 'I want a tune-up'), 'none');
  });

  it('isEmergency returns true for emergency text', () => {
    assert.equal(isEmergency(policy, 'burst pipe in the basement'), true);
  });

  it('isEmergency returns false when policy disabled', () => {
    const disabled = { ...policy, enabled: false } as any;
    assert.equal(isEmergency(disabled, 'no heat'), false);
  });
});

// ─── Escalation policy ────────────────────────────────────────────────────────

describe('EscalationPolicy module', () => {
  const policy = buildBusinessIdentity(makeMinimalRaw()).escalationPolicy;

  it('escalates on "speak to a human"', () => {
    assert.equal(shouldEscalateOnMessage(policy, 'I want to speak to a human'), true);
  });

  it('escalates on complaint keyword', () => {
    assert.equal(shouldEscalateOnMessage(policy, 'This is unacceptable, I have a complaint'), true);
  });

  it('does not escalate on normal message', () => {
    assert.equal(shouldEscalateOnMessage(policy, 'My AC is not working'), false);
  });

  it('shouldEscalateOnScore returns true when below threshold', () => {
    const policyWithThreshold = { ...policy, triggers: ['low_confidence'], confidenceThreshold: 40 } as any;
    assert.equal(shouldEscalateOnScore(policyWithThreshold, 25), true);
  });

  it('shouldEscalateOnScore returns false when above threshold', () => {
    const policyWithThreshold = { ...policy, triggers: ['low_confidence'], confidenceThreshold: 40 } as any;
    assert.equal(shouldEscalateOnScore(policyWithThreshold, 75), false);
  });
});

// ─── Permissions ──────────────────────────────────────────────────────────────

describe('Permissions module', () => {
  const perms = buildBusinessIdentity(makeMinimalRaw()).permissions;

  it('isPermitted returns true for allowed action', () => {
    assert.equal(isPermitted(perms, 'book_appointment'), true);
    assert.equal(isPermitted(perms, 'answer_faqs'), true);
  });

  it('isDenied returns true for denied action', () => {
    assert.equal(isDenied(perms, 'negotiate_pricing'), true);
    assert.equal(isDenied(perms, 'diagnose_equipment'), true);
  });

  it('isPermitted returns false for action not in allowed list', () => {
    assert.equal(isPermitted(perms, 'reschedule_appointment'), false);
  });
});

// ─── Brand personality ────────────────────────────────────────────────────────

describe('BrandPersonality module', () => {
  it('toPromptDirectives includes tone, energy, empathy', () => {
    const identity = buildBusinessIdentity(makeMinimalRaw());
    const directives = brandToPrompt(identity.brandPersonality);
    assert.ok(directives.includes('Communication style:'));
    assert.ok(directives.includes('Energy level:'));
  });

  it('emoji directive reflects policy', () => {
    const identity = buildBusinessIdentity(makeMinimalRaw({
      brandPersonality: { tone: 'friendly', energy: 'high', empathy: 'high', emojiPolicy: 'never', sentenceStyle: 'short', humor: false },
    }));
    const directives = brandToPrompt(identity.brandPersonality);
    assert.ok(directives.toLowerCase().includes('never'));
  });
});

// ─── Receptionist identity ────────────────────────────────────────────────────

describe('ReceptionistIdentity module', () => {
  const identity = buildBusinessIdentity(makeMinimalRaw({
    receptionistIdentity: {
      aiName:               'Emma',
      role:                 'Virtual Service Coordinator',
      greetingTemplate:     "Hi! I'm {aiName}. How can I help?",
      introductionTemplate: "I'm {aiName}, your {role} at {businessName}.",
      signOffTemplate:      "Thanks for calling {businessName}!",
    },
  })).receptionistIdentity;

  it('renderGreeting interpolates aiName', () => {
    const text = renderGreeting(identity, 'Cool Air HVAC');
    assert.ok(text.includes('Emma'), `Expected "Emma" in: "${text}"`);
  });

  it('renderSignOff interpolates businessName', () => {
    const text = renderSignOff(identity, 'Cool Air HVAC');
    assert.ok(text.includes('Cool Air HVAC'), `Expected business name in: "${text}"`);
  });
});

// ─── Conversation rules ───────────────────────────────────────────────────────

describe('ConversationRules module', () => {
  const rules = buildBusinessIdentity(makeMinimalRaw({
    conversationRules: {
      enabled: ['always_thank_customer', 'never_diagnose_equipment'],
      custom:  [{ id: 'c1', description: 'test', instruction: 'Always greet by first name.' }],
    },
  })).conversationRules;

  it('isRuleEnabled returns true for enabled rule', () => {
    assert.equal(isRuleEnabled(rules, 'always_thank_customer'), true);
  });

  it('isRuleEnabled returns false for disabled rule', () => {
    assert.equal(isRuleEnabled(rules, 'collect_email'), false);
  });

  it('toPromptDirectives includes custom rule instruction', () => {
    const directives = rulesToPrompt(rules);
    assert.ok(directives.includes('Always greet by first name.'));
  });

  it('toPromptDirectives includes enabled built-in rules', () => {
    const directives = rulesToPrompt(rules);
    assert.ok(directives.some(d => d.includes('diagnose')));
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe('BusinessIdentityCache', () => {
  it('get returns null for unknown key', () => {
    const cache = new BusinessIdentityCache();
    assert.equal(cache.get('unknown'), null);
  });

  it('set then get returns the identity', () => {
    const cache    = new BusinessIdentityCache();
    const identity = buildBusinessIdentity(makeMinimalRaw()) as BusinessIdentity;
    cache.set('org-123', identity);
    assert.equal(cache.get('org-123')?.organizationId, 'org-123');
  });

  it('invalidate removes the entry', () => {
    const cache    = new BusinessIdentityCache();
    const identity = buildBusinessIdentity(makeMinimalRaw()) as BusinessIdentity;
    cache.set('org-123', identity);
    cache.invalidate('org-123');
    assert.equal(cache.get('org-123'), null);
  });

  it('respects TTL expiry', async () => {
    const cache    = new BusinessIdentityCache({ ttlMs: 50 });
    const identity = buildBusinessIdentity(makeMinimalRaw()) as BusinessIdentity;
    cache.set('org-123', identity);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(cache.get('org-123'), null, 'entry should have expired');
  });

  it('evicts oldest entry when maxEntries is reached', () => {
    const cache = new BusinessIdentityCache({ maxEntries: 2 });
    const base = (id: string, name: string) => makeMinimalRaw({
      organizationId: id,
      companyProfile: { businessId: id, businessName: name, industry: 'hvac' },
      contactInfo: { phone: '555-000-1111', timezone: 'UTC' },
    });
    const id1 = buildBusinessIdentity(base('org-1', 'A')) as BusinessIdentity;
    const id2 = buildBusinessIdentity(base('org-2', 'B')) as BusinessIdentity;
    const id3 = buildBusinessIdentity(base('org-3', 'C')) as BusinessIdentity;
    cache.set('org-1', id1);
    cache.set('org-2', id2);
    cache.set('org-3', id3);   // should evict org-1
    assert.equal(cache.get('org-1'), null, 'oldest entry should be evicted');
    assert.ok(cache.get('org-3') !== null, 'newest entry should be present');
  });
});
