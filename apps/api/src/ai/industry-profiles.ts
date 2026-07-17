/**
 * ai/industry-profiles.ts
 *
 * Industry profiles define which fields are required and in what priority
 * order the conversation planner should collect them.
 *
 * Adding a new industry requires only adding a new entry to INDUSTRY_PROFILES.
 * The planner and orchestrator pick it up automatically.
 */

import type { ConversationProgress, RichConversationMemory } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IndustryKey = 'hvac' | 'saas' | 'agency' | 'realestate' | 'general';

export interface FieldRequirement {
  /** Which progress flag this satisfies */
  field:     keyof ConversationProgress;
  priority:  'critical' | 'high' | 'medium' | 'low';
  /** Human-readable goal description (used in ConversationPlan.nextGoal) */
  goal:      string;
  /** Ready-to-use question variants; planner rotates through them */
  questions: string[];
  /** Only include this requirement when the condition holds (optional) */
  condition?: (memory: RichConversationMemory) => boolean;
}

export interface IndustryProfile {
  key:              IndustryKey;
  displayName:      string;
  description:      string;
  requiredFields:   FieldRequirement[];
  /** Keywords that identify this industry from org config or conversation */
  identifiers:      string[];
}

// ─── Profiles ────────────────────────────────────────────────────────────────

const HVAC_PROFILE: IndustryProfile = {
  key:         'hvac',
  displayName: 'HVAC',
  description: 'Heating, ventilation, and air conditioning service companies',
  identifiers: ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace', 'heat pump', 'plumbing', 'ac', 'technician', 'dispatcher'],
  requiredFields: [
    {
      field:    'visitorNameCollected',
      priority: 'critical',
      goal:     'get the customer\'s name',
      questions: [
        "What's your name?",
        "Can I get your first name?",
        "First, what's your name?",
        "Who am I speaking with today?",
      ],
    },
    {
      field:    'serviceCollected',
      priority: 'critical',
      goal:     'understand the service needed',
      questions: [
        "What service do you need today?",
        "What's going on with your HVAC system?",
        "What can we help you with?",
        "What's the issue you're experiencing?",
      ],
    },
    {
      field:    'emergencyCollected',
      priority: 'high',
      goal:     'determine if this is an emergency',
      questions: [
        "Is this an emergency — like no heat or no A/C?",
        "Would you say this is urgent?",
        "Is this an emergency situation?",
      ],
      // Only ask if the service has been identified
      condition: (m) => m.rich.service.value !== null,
    },
    {
      field:    'phoneCollected',
      priority: 'critical',
      goal:     'collect a phone number',
      questions: [
        "What's the best number for our technician to reach you?",
        "What phone number can we call you on?",
        "What's a good number for you?",
        "What number should we use to confirm your appointment?",
      ],
    },
    {
      field:    'addressCollected',
      priority: 'high',
      goal:     'get the service address',
      questions: [
        "What's the service address or ZIP code?",
        "What's the address we'd be coming out to?",
        "What ZIP code is the service location in?",
        "What's your home address?",
      ],
    },
    {
      field:    'appointmentCollected',
      priority: 'high',
      goal:     'find a preferred appointment time',
      questions: [
        "What day works best for you?",
        "When would you like us to come out?",
        "Do you have a preferred day or time?",
        "Would tomorrow work, or do you have a specific day in mind?",
      ],
      // Only ask once we have name, phone, and address
      condition: (m) =>
        m.rich.phone.value !== null &&
        (m.rich.address.value !== null || m.rich.zip.value !== null),
    },
  ],
};

const SAAS_PROFILE: IndustryProfile = {
  key:         'saas',
  displayName: 'LeadFlow SaaS',
  description: 'Software-as-a-service and technology businesses',
  identifiers: ['saas', 'software', 'technology', 'tech', 'platform', 'app', 'startup', 'crm', 'leadflow'],
  requiredFields: [
    {
      field:    'visitorNameCollected',
      priority: 'critical',
      goal:     'get the visitor\'s name',
      questions: [
        "What's your name?",
        "Can I get your name?",
        "Who am I speaking with?",
      ],
    },
    {
      field:    'companyCollected',
      priority: 'critical',
      goal:     'learn the company name',
      questions: [
        "What's the name of your business?",
        "What company are you with?",
        "Who do you work for?",
      ],
    },
    {
      field:    'painCollected',
      priority: 'high',
      goal:     'understand their main challenge',
      questions: [
        "What's the biggest challenge you're facing right now?",
        "What problem are you trying to solve?",
        "What's bringing you here today?",
      ],
    },
    {
      field:    'phoneCollected',
      priority: 'high',
      goal:     'collect contact details',
      questions: [
        "What's the best number to reach you on?",
        "Can I get a phone number for you?",
        "What's a good contact number?",
      ],
    },
    {
      field:    'budgetCollected',
      priority: 'medium',
      goal:     'understand the budget range',
      questions: [
        "Do you have a budget range in mind for this?",
        "What kind of investment are you looking at?",
        "Is there a budget you're working with?",
      ],
    },
    {
      field:    'timelineCollected',
      priority: 'medium',
      goal:     'understand the timeline',
      questions: [
        "When are you looking to get started?",
        "What's your timeline for this?",
        "How soon do you need this in place?",
      ],
    },
  ],
};

const AGENCY_PROFILE: IndustryProfile = {
  key:         'agency',
  displayName: 'Agency',
  description: 'Marketing, creative, or consulting agencies',
  identifiers: ['agency', 'marketing', 'creative', 'consulting', 'design', 'branding'],
  requiredFields: [
    {
      field:    'visitorNameCollected',
      priority: 'critical',
      goal:     'get the visitor\'s name',
      questions: ["What's your name?", "Who am I speaking with?"],
    },
    {
      field:    'companyCollected',
      priority: 'critical',
      goal:     'learn the company name',
      questions: ["What agency are you with?", "What's your company name?"],
    },
    {
      field:    'painCollected',
      priority: 'high',
      goal:     'understand the core challenge',
      questions: ["What's your biggest client acquisition challenge?", "What are you trying to improve?"],
    },
    {
      field:    'phoneCollected',
      priority: 'high',
      goal:     'collect contact details',
      questions: ["What's the best number to reach you?", "Can I get your phone number?"],
    },
    {
      field:    'budgetCollected',
      priority: 'medium',
      goal:     'understand the budget',
      questions: ["What budget are you working with?", "Do you have a rough budget in mind?"],
    },
  ],
};

const GENERAL_PROFILE: IndustryProfile = {
  key:         'general',
  displayName: 'General',
  description: 'General business inquiry',
  identifiers: [],
  requiredFields: [
    {
      field:    'visitorNameCollected',
      priority: 'critical',
      goal:     'get the visitor\'s name',
      questions: ["What's your name?", "Can I get your name?", "Who am I speaking with?"],
    },
    {
      field:    'painCollected',
      priority: 'high',
      goal:     'understand what they need',
      questions: ["What can I help you with today?", "What brings you here?", "What are you looking to achieve?"],
    },
    {
      field:    'phoneCollected',
      priority: 'high',
      goal:     'collect contact details',
      questions: ["What's the best number to reach you?", "Can I get a phone number?"],
    },
    {
      field:    'companyCollected',
      priority: 'medium',
      goal:     'learn the company name',
      questions: ["What company are you with?", "Who do you work for?"],
    },
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const INDUSTRY_PROFILES: Record<IndustryKey, IndustryProfile> = {
  hvac:       HVAC_PROFILE,
  saas:       SAAS_PROFILE,
  agency:     AGENCY_PROFILE,
  realestate: {
    key:         'realestate',
    displayName: 'Real Estate',
    description: 'Real estate agencies and brokerages',
    identifiers: ['real estate', 'realty', 'property', 'broker', 'agent', 'homes'],
    requiredFields: [
      { field: 'visitorNameCollected', priority: 'critical', goal: "get the visitor's name", questions: ["What's your name?", "Who am I speaking with?"] },
      { field: 'painCollected',        priority: 'high',     goal: 'understand their challenge', questions: ["What's your biggest challenge with lead follow-up?", "What are you trying to improve?"] },
      { field: 'phoneCollected',       priority: 'high',     goal: 'collect contact details', questions: ["What's the best number to reach you?"] },
      { field: 'budgetCollected',      priority: 'medium',   goal: 'understand the budget', questions: ["What budget are you working with?"] },
    ],
  },
  general:    GENERAL_PROFILE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getProfile(key: IndustryKey): IndustryProfile {
  return INDUSTRY_PROFILES[key] ?? INDUSTRY_PROFILES.general;
}

/**
 * Detect the most likely industry from org config and conversation memory.
 * Falls back to 'general' when nothing matches.
 */
export function detectIndustry(
  orgIndustry: string,
  memory: RichConversationMemory,
): IndustryKey {
  const text = [
    orgIndustry,
    memory.industry ?? '',
    memory.rich.service.value ?? '',
    memory.servicesDiscussed.join(' '),
  ].join(' ').toLowerCase();

  for (const [key, profile] of Object.entries(INDUSTRY_PROFILES) as [IndustryKey, IndustryProfile][]) {
    if (key === 'general') continue;
    if (profile.identifiers.some(id => text.includes(id))) return key;
  }
  return 'general';
}
