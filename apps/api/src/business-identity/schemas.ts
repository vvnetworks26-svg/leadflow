/**
 * business-identity/schemas.ts
 *
 * Zod validation schemas for every Business Identity module.
 * All inbound configuration must pass these schemas before a
 * BusinessIdentity object is constructed.
 *
 * Exported schemas mirror the types in types.ts exactly.
 * Invalid config throws a ZodError with actionable field messages.
 */

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const IndustrySchema = z.enum([
  'hvac', 'plumbing', 'roofing', 'electrical', 'pest_control',
  'landscaping', 'cleaning', 'saas', 'agency', 'real_estate', 'general',
]);

export const AiToneSchema      = z.enum(['friendly', 'professional', 'casual']);
export const AiEnergySchema    = z.enum(['high', 'medium', 'calm']);
export const AiEmpathySchema   = z.enum(['high', 'standard', 'low']);
export const EmojiPolicySchema = z.enum(['allowed', 'sparingly', 'never']);
export const SentenceStyleSchema = z.enum(['short', 'conversational', 'formal']);

export const AiPermissionSchema = z.enum([
  'book_appointment', 'reschedule_appointment', 'cancel_appointment',
  'answer_faqs', 'capture_lead', 'quote_services',
]);

export const AiRestrictionSchema = z.enum([
  'negotiate_pricing', 'diagnose_equipment', 'promise_arrival_time',
  'give_legal_advice', 'give_medical_advice', 'give_financial_advice',
]);

export const EscalationTriggerSchema = z.enum([
  'customer_requests_human', 'complaint', 'payment_issue', 'legal_issue',
  'low_confidence', 'profanity', 'unsupported_request', 'repeated_failure',
]);

export const ConversationRuleKeySchema = z.enum([
  'never_ask_company_name', 'always_verify_phone', 'always_summarize_booking',
  'never_diagnose_equipment', 'always_thank_customer',
  'collect_email', 'collect_address', 'ask_preferred_technician',
]);

export const IntegrationKeySchema = z.enum([
  'google_calendar', 'outlook', 'crm', 'sms', 'email', 'voice',
  'stripe', 'twilio', 'zapier',
]);

export const BusinessGoalPrioritySchema = z.enum(['primary', 'secondary', 'tertiary']);

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** HH:MM 24-hour time string */
const TimeString = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM');

/** YYYY-MM-DD or MM-DD for recurring holidays */
const DateString = z.string().regex(
  /^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})$/,
  'Date must be YYYY-MM-DD or MM-DD'
);

// ─── Module schemas ───────────────────────────────────────────────────────────

export const CompanyProfileSchema = z.object({
  businessId:   z.string().min(1),
  businessName: z.string().min(1).max(120),
  legalName:    z.string().max(200).default(''),
  industry:     IndustrySchema,
  subIndustry:  z.string().max(80).default(''),
  description:  z.string().max(1000).default(''),
  website:      z.string().url().or(z.literal('')).default(''),
  logo:         z.string().default(''),
  tagline:      z.string().max(200).default(''),
});

export const ContactInfoSchema = z.object({
  phone:    z.string().min(7).max(20),
  email:    z.string().email().or(z.literal('')).default(''),
  address:  z.string().max(200).default(''),
  city:     z.string().max(100).default(''),
  state:    z.string().max(100).default(''),
  country:  z.string().max(100).default('US'),
  timezone: z.string().min(1),   // IANA tz string e.g. "America/New_York"
});

export const TravelFeeRuleSchema = z.object({
  minMiles: z.number().min(0),
  maxMiles: z.number().min(0),
  feeUsd:   z.number().min(0),
}).refine(r => r.maxMiles > r.minMiles, 'maxMiles must be greater than minMiles');

export const ServiceAreaSchema = z.object({
  primaryCity:   z.string().max(100).default(''),
  cities:        z.array(z.string()).default([]),
  counties:      z.array(z.string()).default([]),
  zipCodes:      z.array(z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP')).default([]),
  radiusMiles:   z.number().positive().nullable().default(null),
  travelFeeRules: z.array(TravelFeeRuleSchema).default([]),
  enabled:       z.boolean().default(true),
});

export const ServiceCatalogItemSchema = z.object({
  id:                z.string().min(1),
  name:              z.string().min(1).max(100),
  description:       z.string().max(500).default(''),
  keywords:          z.array(z.string()).default([]),
  emergencyEligible: z.boolean().default(false),
  bookable:          z.boolean().default(true),
  estimatedDuration: z.number().int().min(5).max(480).default(60),   // minutes
  enabled:           z.boolean().default(true),
});

export const DayScheduleSchema = z.object({
  isOpen:    z.boolean(),
  openTime:  TimeString,
  closeTime: TimeString,
});

export const HolidayEntrySchema = z.object({
  date:      DateString,
  name:      z.string().min(1),
  recurring: z.boolean().default(false),
});

export const BusinessHoursSchema = z.object({
  monday:    DayScheduleSchema,
  tuesday:   DayScheduleSchema,
  wednesday: DayScheduleSchema,
  thursday:  DayScheduleSchema,
  friday:    DayScheduleSchema,
  saturday:  DayScheduleSchema,
  sunday:    DayScheduleSchema,
  emergencyAfterHours: z.boolean().default(true),
  vacationMode:        z.boolean().default(false),
  holidays:            z.array(HolidayEntrySchema).default([]),
  closedDates:         z.array(DateString).default([]),
});

export const BrandPersonalitySchema = z.object({
  tone:          AiToneSchema.default('friendly'),
  energy:        AiEnergySchema.default('medium'),
  empathy:       AiEmpathySchema.default('high'),
  emojiPolicy:   EmojiPolicySchema.default('sparingly'),
  sentenceStyle: SentenceStyleSchema.default('conversational'),
  humor:         z.boolean().default(false),
});

export const ReceptionistIdentitySchema = z.object({
  aiName:               z.string().min(1).max(50).default('Assistant'),
  role:                 z.string().max(80).default('Virtual Service Coordinator'),
  greetingTemplate:     z.string().max(300).default("Hi! I'm {aiName}. How can I help you today?"),
  introductionTemplate: z.string().max(300).default("I'm {aiName}, your {role} for {businessName}."),
  signOffTemplate:      z.string().max(300).default("Thanks for reaching out to {businessName}. Have a great day!"),
});

export const CustomRuleSchema = z.object({
  id:          z.string().min(1),
  description: z.string().min(1),
  instruction: z.string().min(1),
});

export const ConversationRulesSchema = z.object({
  enabled: z.array(ConversationRuleKeySchema).default([]),
  custom:  z.array(CustomRuleSchema).default([]),
});

export const BookingRulesSchema = z.object({
  minimumNoticeHours:  z.number().int().min(0).max(168).default(1),
  maximumBookingDays:  z.number().int().min(1).max(365).default(90),
  defaultDurationMins: z.number().int().min(15).max(480).default(60),
  slotIntervalMins:    z.number().int().min(15).max(120).default(30),
  sameDayBooking:      z.boolean().default(true),
  weekendBooking:      z.boolean().default(false),
  businessBufferMins:  z.number().int().min(0).max(120).default(0),
});

export const EmergencyTriggerSchema = z.object({
  keyword:  z.string().min(1),
  priority: z.enum(['critical', 'high', 'standard']).default('high'),
});

export const EmergencyPolicySchema = z.object({
  enabled:  z.boolean().default(true),
  triggers: z.array(EmergencyTriggerSchema).default([
    { keyword: 'no heat',         priority: 'critical' },
    { keyword: 'no cooling',      priority: 'critical' },
    { keyword: 'no ac',           priority: 'critical' },
    { keyword: 'burst pipe',      priority: 'critical' },
    { keyword: 'flooding',        priority: 'critical' },
    { keyword: 'gas leak',        priority: 'critical' },
    { keyword: 'power outage',    priority: 'critical' },
    { keyword: 'storm damage',    priority: 'high' },
    { keyword: 'no hot water',    priority: 'high' },
    { keyword: 'freezing',        priority: 'critical' },
  ]),
});

export const EscalationPolicySchema = z.object({
  triggers:            z.array(EscalationTriggerSchema).default([
    'customer_requests_human', 'complaint', 'payment_issue', 'legal_issue',
  ]),
  confidenceThreshold: z.number().min(0).max(100).default(30),
  escalationMessage:   z.string().max(500).default(
    "I'd like to connect you with someone from our team who can best assist you."
  ),
});

export const AiPermissionsSchema = z.object({
  allowed: z.array(AiPermissionSchema).default([
    'book_appointment', 'answer_faqs', 'capture_lead',
  ]),
  denied: z.array(AiRestrictionSchema).default([
    'negotiate_pricing', 'diagnose_equipment',
    'promise_arrival_time', 'give_legal_advice',
  ]),
});

export const IntegrationConfigSchema = z.object({
  key:     IntegrationKeySchema,
  enabled: z.boolean().default(false),
  label:   z.string().max(80).default(''),
});

export const BusinessGoalSchema = z.object({
  priority:    BusinessGoalPrioritySchema,
  description: z.string().min(1).max(200),
});

// ─── Full aggregate schema ────────────────────────────────────────────────────

export const BusinessIdentityInputSchema = z.object({
  organizationId:      z.string().min(1),
  companyProfile:      CompanyProfileSchema,
  contactInfo:         ContactInfoSchema,
  serviceArea:         ServiceAreaSchema.default({}),
  servicesCatalog:     z.array(ServiceCatalogItemSchema).default([]),
  businessHours:       BusinessHoursSchema,
  brandPersonality:    BrandPersonalitySchema.default({}),
  receptionistIdentity: ReceptionistIdentitySchema.default({}),
  conversationRules:   ConversationRulesSchema.default({}),
  bookingRules:        BookingRulesSchema.default({}),
  emergencyPolicy:     EmergencyPolicySchema.default({}),
  escalationPolicy:    EscalationPolicySchema.default({}),
  permissions:         AiPermissionsSchema.default({}),
  integrations:        z.array(IntegrationConfigSchema).default([]),
  businessGoals:       z.array(BusinessGoalSchema).default([
    { priority: 'primary',   description: 'Book appointments' },
    { priority: 'secondary', description: 'Capture leads' },
    { priority: 'tertiary',  description: 'Reduce call volume' },
  ]),
});

export type BusinessIdentityInput = z.input<typeof BusinessIdentityInputSchema>;
