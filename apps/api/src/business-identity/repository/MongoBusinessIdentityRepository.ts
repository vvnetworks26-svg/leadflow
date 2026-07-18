/**
 * business-identity/repository/MongoBusinessIdentityRepository.ts
 *
 * MongoDB implementation of IBusinessIdentityRepository.
 * Reads from Business.model + Organization.model and maps to BusinessIdentity.
 *
 * Mapping strategy:
 *   Business.model  → most fields (services, hours, aiConfig, contact)
 *   Organization    → organizationId, industry, timezone, slug
 *
 * All optional / missing fields fall back to schema defaults via the factory.
 */

import { OrganizationModel } from '../../models/Organization.model';
import { BusinessModel }     from '../../models/Business.model';
import { buildBusinessIdentity } from '../BusinessIdentityFactory';
import type { IBusinessIdentityRepository } from './BusinessIdentityRepository';
import type { BusinessIdentity }            from '../types';
import type { Industry }                    from '../types';

// ─── Industry mapping ─────────────────────────────────────────────────────────

function normalizeIndustry(raw: string | undefined): Industry {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('hvac') || lower.includes('heating') || lower.includes('cooling')) return 'hvac';
  if (lower.includes('plumb'))  return 'plumbing';
  if (lower.includes('roof'))   return 'roofing';
  if (lower.includes('electr')) return 'electrical';
  if (lower.includes('pest'))   return 'pest_control';
  if (lower.includes('lands'))  return 'landscaping';
  if (lower.includes('clean'))  return 'cleaning';
  if (lower.includes('saas') || lower.includes('software')) return 'saas';
  if (lower.includes('agenc'))  return 'agency';
  if (lower.includes('real'))   return 'real_estate';
  return 'general';
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class MongoBusinessIdentityRepository implements IBusinessIdentityRepository {
  async loadByOrganizationId(organizationId: string): Promise<BusinessIdentity | null> {
    const [org, biz] = await Promise.all([
      OrganizationModel.findById(organizationId).lean(),
      BusinessModel.findOne({ organizationId }).lean(),
    ]);

    if (!org) return null;

    const o = org  as any;
    const b = biz  as any ?? {};

    const hours = b.businessHours ?? {};
    const defaultDay = { isOpen: false, openTime: '08:00', closeTime: '17:00' };

    const raw = {
      organizationId,

      companyProfile: {
        businessId:   organizationId,
        businessName: b.companyName ?? o.name ?? 'Business',
        legalName:    b.companyName ?? o.name ?? '',
        industry:     normalizeIndustry(o.industry ?? b.industry),
        subIndustry:  '',
        description:  b.description ?? '',
        website:      b.website ?? '',
        logo:         b.logoUrl ?? '',
        tagline:      '',
      },

      contactInfo: {
        phone:    b.phone    ?? '',
        email:    b.email    ?? '',
        address:  b.address  ?? '',
        city:     b.city     ?? '',
        state:    b.state    ?? '',
        country:  'US',
        timezone: o.timezone ?? b.timezone ?? 'America/New_York',
      },

      serviceArea: {
        primaryCity:    b.city ?? '',
        cities:         [],
        counties:       [],
        zipCodes:       b.serviceAreaZips ?? [],
        radiusMiles:    null,
        travelFeeRules: [],
        enabled:        b.serviceAreaEnabled ?? true,
      },

      servicesCatalog: (b.services ?? []).map((s: any) => ({
        id:                s.id ?? s._id?.toString() ?? s.name,
        name:              s.name,
        description:       s.description ?? '',
        keywords:          [s.name.toLowerCase()],
        emergencyEligible: s.emergencyAvailable ?? false,
        bookable:          s.active ?? true,
        estimatedDuration: s.estimatedDuration ?? 60,
        enabled:           s.active ?? true,
      })),

      businessHours: {
        monday:    hours.monday    ?? defaultDay,
        tuesday:   hours.tuesday   ?? defaultDay,
        wednesday: hours.wednesday ?? defaultDay,
        thursday:  hours.thursday  ?? defaultDay,
        friday:    hours.friday    ?? defaultDay,
        saturday:  hours.saturday  ?? defaultDay,
        sunday:    hours.sunday    ?? defaultDay,
        emergencyAfterHours: hours.emergencyAfterHours ?? true,
        vacationMode:        hours.vacationMode        ?? false,
        holidays:            [],
        closedDates:         [],
      },

      brandPersonality: {
        tone:          mapTone(b.aiConfig?.tone),
        energy:        'medium',
        empathy:       'high',
        emojiPolicy:   'sparingly',
        sentenceStyle: 'conversational',
        humor:         false,
      },

      receptionistIdentity: {
        aiName:               'Assistant',
        role:                 'Virtual Service Coordinator',
        greetingTemplate:     b.aiConfig?.welcomeMessage
                                ?? "Hi! I'm {aiName}. How can I help you today?",
        introductionTemplate: "I'm {aiName}, your {role} for {businessName}.",
        signOffTemplate:      "Thanks for reaching out to {businessName}. Have a great day!",
      },

      conversationRules: {
        enabled: buildEnabledRules(b.aiConfig),
        custom:  [],
      },

      bookingRules: {
        minimumNoticeHours:  1,
        maximumBookingDays:  90,
        defaultDurationMins: 60,
        slotIntervalMins:    30,
        sameDayBooking:      true,
        weekendBooking:      !!(hours.saturday?.isOpen || hours.sunday?.isOpen),
        businessBufferMins:  0,
      },

      emergencyPolicy: {
        enabled:  b.aiConfig?.enableEmergencyWorkflow ?? true,
        triggers: [],   // default triggers applied by schema
      },

      escalationPolicy: {
        triggers:            ['customer_requests_human', 'complaint', 'legal_issue'],
        confidenceThreshold: 30,
        escalationMessage:   "I'd like to connect you with someone from our team.",
      },

      permissions: {
        allowed: ['book_appointment', 'answer_faqs', 'capture_lead'],
        denied:  ['negotiate_pricing', 'diagnose_equipment', 'promise_arrival_time', 'give_legal_advice'],
      },

      integrations: [],

      businessGoals: [
        { priority: 'primary',   description: 'Book appointments' },
        { priority: 'secondary', description: 'Capture leads' },
        { priority: 'tertiary',  description: 'Reduce call volume' },
      ],
    };

    return buildBusinessIdentity(raw);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapTone(raw: string | undefined): 'friendly' | 'professional' | 'casual' {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'professional') return 'professional';
  if (lower === 'casual')       return 'casual';
  return 'friendly';
}

function buildEnabledRules(aiConfig: any): string[] {
  const rules: string[] = ['always_thank_customer', 'always_summarize_booking'];
  if (aiConfig?.collectEmail)   rules.push('collect_email');
  if (aiConfig?.collectAddress) rules.push('collect_address');
  return rules;
}
