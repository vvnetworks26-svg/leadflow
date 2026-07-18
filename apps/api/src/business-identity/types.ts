/**
 * business-identity/types.ts
 *
 * All types and enums for the Business Identity Engine.
 * Single source of truth — every module imports from here.
 * No business logic — types only.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Industry =
  | 'hvac'
  | 'plumbing'
  | 'roofing'
  | 'electrical'
  | 'pest_control'
  | 'landscaping'
  | 'cleaning'
  | 'saas'
  | 'agency'
  | 'real_estate'
  | 'general';

export type AiTone = 'friendly' | 'professional' | 'casual';
export type AiEnergy = 'high' | 'medium' | 'calm';
export type AiEmpathy = 'high' | 'standard' | 'low';
export type EmojiPolicy = 'allowed' | 'sparingly' | 'never';
export type SentenceStyle = 'short' | 'conversational' | 'formal';

export type IntegrationKey =
  | 'google_calendar'
  | 'outlook'
  | 'crm'
  | 'sms'
  | 'email'
  | 'voice'
  | 'stripe'
  | 'twilio'
  | 'zapier';

export type BusinessGoalPriority = 'primary' | 'secondary' | 'tertiary';

export type AiPermission =
  | 'book_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'answer_faqs'
  | 'capture_lead'
  | 'quote_services';

export type AiRestriction =
  | 'negotiate_pricing'
  | 'diagnose_equipment'
  | 'promise_arrival_time'
  | 'give_legal_advice'
  | 'give_medical_advice'
  | 'give_financial_advice';

export type EscalationTrigger =
  | 'customer_requests_human'
  | 'complaint'
  | 'payment_issue'
  | 'legal_issue'
  | 'low_confidence'
  | 'profanity'
  | 'unsupported_request'
  | 'repeated_failure';

export type ConversationRuleKey =
  | 'never_ask_company_name'
  | 'always_verify_phone'
  | 'always_summarize_booking'
  | 'never_diagnose_equipment'
  | 'always_thank_customer'
  | 'collect_email'
  | 'collect_address'
  | 'ask_preferred_technician';

// ─── Module types ─────────────────────────────────────────────────────────────

export interface CompanyProfile {
  readonly businessId:   string;
  readonly businessName: string;
  readonly legalName:    string;
  readonly industry:     Industry;
  readonly subIndustry:  string;
  readonly description:  string;
  readonly website:      string;
  readonly logo:         string;
  readonly tagline:      string;
}

export interface ContactInfo {
  readonly phone:    string;
  readonly email:    string;
  readonly address:  string;
  readonly city:     string;
  readonly state:    string;
  readonly country:  string;
  readonly timezone: string;
}

export interface ServiceArea {
  readonly primaryCity:  string;
  readonly cities:       readonly string[];
  readonly counties:     readonly string[];
  readonly zipCodes:     readonly string[];
  readonly radiusMiles:  number | null;
  readonly travelFeeRules: readonly TravelFeeRule[];
  readonly enabled:      boolean;
}

export interface TravelFeeRule {
  readonly minMiles: number;
  readonly maxMiles: number;
  readonly feeUsd:   number;
}

export interface ServiceCatalogItem {
  readonly id:                string;
  readonly name:              string;
  readonly description:       string;
  readonly keywords:          readonly string[];
  readonly emergencyEligible: boolean;
  readonly bookable:          boolean;
  readonly estimatedDuration: number;   // minutes
  readonly enabled:           boolean;
}

export interface DaySchedule {
  readonly isOpen:    boolean;
  readonly openTime:  string;   // HH:MM
  readonly closeTime: string;   // HH:MM
}

export interface BusinessHours {
  readonly monday:    DaySchedule;
  readonly tuesday:   DaySchedule;
  readonly wednesday: DaySchedule;
  readonly thursday:  DaySchedule;
  readonly friday:    DaySchedule;
  readonly saturday:  DaySchedule;
  readonly sunday:    DaySchedule;
  readonly emergencyAfterHours: boolean;
  readonly vacationMode:        boolean;
  readonly holidays:            readonly HolidayEntry[];
  readonly closedDates:         readonly string[];   // ISO date strings YYYY-MM-DD
}

export interface HolidayEntry {
  readonly date:      string;   // YYYY-MM-DD or MM-DD for recurring
  readonly name:      string;
  readonly recurring: boolean;
}

export interface BrandPersonality {
  readonly tone:          AiTone;
  readonly energy:        AiEnergy;
  readonly empathy:       AiEmpathy;
  readonly emojiPolicy:   EmojiPolicy;
  readonly sentenceStyle: SentenceStyle;
  readonly humor:         boolean;
}

export interface ReceptionistIdentity {
  readonly aiName:               string;
  readonly role:                 string;
  readonly greetingTemplate:     string;
  readonly introductionTemplate: string;
  readonly signOffTemplate:      string;
}

export interface ConversationRules {
  readonly enabled: readonly ConversationRuleKey[];
  readonly custom:  readonly CustomRule[];
}

export interface CustomRule {
  readonly id:          string;
  readonly description: string;
  readonly instruction: string;
}

export interface BookingRules {
  readonly minimumNoticeHours:  number;
  readonly maximumBookingDays:  number;
  readonly defaultDurationMins: number;
  readonly slotIntervalMins:    number;
  readonly sameDayBooking:      boolean;
  readonly weekendBooking:      boolean;
  readonly businessBufferMins:  number;
}

export interface EmergencyPolicy {
  readonly enabled:   boolean;
  readonly triggers:  readonly EmergencyTrigger[];
}

export interface EmergencyTrigger {
  readonly keyword:  string;
  readonly priority: 'critical' | 'high' | 'standard';
}

export interface EscalationPolicy {
  readonly triggers:            readonly EscalationTrigger[];
  readonly confidenceThreshold: number;   // 0–100: escalate below this
  readonly escalationMessage:   string;
}

export interface AiPermissions {
  readonly allowed:  readonly AiPermission[];
  readonly denied:   readonly AiRestriction[];
}

export interface IntegrationConfig {
  readonly key:     IntegrationKey;
  readonly enabled: boolean;
  readonly label:   string;
}

export interface BusinessGoal {
  readonly priority:    BusinessGoalPriority;
  readonly description: string;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/**
 * BusinessIdentity is the immutable aggregate that composes all modules.
 * It is loaded once per conversation and passed as read-only context.
 * No module modifies it after construction.
 */
export interface BusinessIdentity {
  readonly organizationId:      string;
  readonly companyProfile:      CompanyProfile;
  readonly contactInfo:         ContactInfo;
  readonly serviceArea:         ServiceArea;
  readonly servicesCatalog:     readonly ServiceCatalogItem[];
  readonly businessHours:       BusinessHours;
  readonly brandPersonality:    BrandPersonality;
  readonly receptionistIdentity: ReceptionistIdentity;
  readonly conversationRules:   ConversationRules;
  readonly bookingRules:        BookingRules;
  readonly emergencyPolicy:     EmergencyPolicy;
  readonly escalationPolicy:    EscalationPolicy;
  readonly permissions:         AiPermissions;
  readonly integrations:        readonly IntegrationConfig[];
  readonly businessGoals:       readonly BusinessGoal[];
  readonly loadedAt:            Date;
}
