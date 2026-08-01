/**
 * intent-engine/registry/default-rules.ts
 *
 * Default keyword rules and blueprint mappings.
 * These cover every industry out of the box.
 *
 * Rules are additive — new rules can be appended without modifying existing ones.
 * Blueprint mappings are resolved by (industry, intent) — wildcards (*) supported.
 */

import type { IntentKeywordRule, BlueprintMapping } from '../types';

// ─── Keyword rules ────────────────────────────────────────────────────────────

export const DEFAULT_KEYWORD_RULES: readonly IntentKeywordRule[] = [

  // ── Book appointment ─────────────────────────────────────────────────────
  {
    intent: 'book_appointment', subCategory: '',
    keywords: ['book', 'schedule', 'appointment', 'set up', 'arrange', 'visit', 'come out', 'send someone'],
    phrases:  ['book an appointment', 'schedule a visit', 'set up a time', 'come to my house', 'send a technician'],
    weight: 1,
  },

  // ── Request estimate ──────────────────────────────────────────────────────
  {
    intent: 'request_estimate', subCategory: '',
    keywords: ['estimate', 'quote', 'price', 'cost', 'how much', 'pricing', 'rates', 'fee', 'charge'],
    phrases:  ['how much does it cost', 'give me a quote', 'need an estimate', 'what are your rates'],
    weight: 1,
  },

  // ── Emergency service ─────────────────────────────────────────────────────
  {
    intent: 'emergency_service', subCategory: 'no_heat',
    keywords: ['emergency', 'urgent', 'immediately', 'right now', 'asap', 'no heat', 'no cooling', 'no ac'],
    phrases:  ['no heat', 'no cooling', 'no air conditioning', 'no hot water', 'burst pipe', 'gas leak',
               'flooding', 'water everywhere', 'freezing', 'it is 118 degrees', 'no power',
               'sparks from', 'electrical fire', 'outlet sparking', 'sparking outlet'],
    weight: 2,   // higher weight — emergencies must dominate
  },

  // ── Repair ────────────────────────────────────────────────────────────────
  {
    intent: 'repair', subCategory: '',
    keywords: ['repair', 'fix', 'broken', 'not working', 'stopped working', 'failing', 'issue', 'problem',
               'leak', 'noise', 'strange sound', 'warm air', 'cold air', 'won\'t turn on', 'won\'t start'],
    phrases:  ['it stopped working', 'is not working', 'making noise', 'leaking water', 'blowing warm air'],
    weight: 1,
  },

  // ── Installation ──────────────────────────────────────────────────────────
  {
    intent: 'installation', subCategory: '',
    keywords: ['install', 'installation', 'new system', 'replace', 'replacement', 'new unit', 'upgrade',
               'new hvac', 'new furnace', 'new ac', 'new boiler', 'new water heater', 'new roof'],
    phrases:  ['install a new', 'replace my', 'need a new', 'looking to upgrade'],
    weight: 1,
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  {
    intent: 'maintenance', subCategory: '',
    keywords: ['maintenance', 'tune-up', 'tune up', 'checkup', 'check up', 'service', 'cleaning',
               'filter', 'inspection', 'annual', 'seasonal', 'routine'],
    phrases:  ['annual maintenance', 'seasonal tune-up', 'clean the filters', 'routine service'],
    weight: 1,
  },

  // ── Inspection ────────────────────────────────────────────────────────────
  {
    intent: 'inspection', subCategory: '',
    keywords: ['inspect', 'inspection', 'look at', 'assess', 'evaluation', 'check out', 'take a look'],
    phrases:  ['home inspection', 'have someone look', 'get it inspected', 'assess the damage'],
    weight: 1,
  },

  // ── Warranty ──────────────────────────────────────────────────────────────
  {
    intent: 'warranty', subCategory: '',
    keywords: ['warranty', 'guarantee', 'covered', 'warranty claim', 'under warranty', 'warranty repair'],
    phrases:  ['is it covered', 'under warranty', 'warranty claim', 'my warranty'],
    weight: 1,
  },

  // ── Existing appointment ──────────────────────────────────────────────────
  {
    intent: 'existing_appointment', subCategory: '',
    keywords: ['existing appointment', 'my appointment', 'appointment status', 'when is my', 'technician coming'],
    phrases:  ['when is the technician coming', 'status of my appointment', 'my existing appointment'],
    weight: 1,
  },

  // ── Reschedule ────────────────────────────────────────────────────────────
  {
    intent: 'reschedule', subCategory: '',
    keywords: ['reschedule', 'change appointment', 'move appointment', 'different time', 'different day'],
    phrases:  ['reschedule my appointment', 'change the time', 'can we move it', 'different day'],
    weight: 1,
  },

  // ── Cancel appointment ────────────────────────────────────────────────────
  {
    intent: 'cancel_appointment', subCategory: '',
    keywords: ['cancel', 'cancellation', 'cancel appointment', 'don\'t need', 'no longer need'],
    phrases:  ['cancel my appointment', 'i want to cancel', 'no longer need the appointment'],
    weight: 1,
  },

  // ── Billing question ──────────────────────────────────────────────────────
  {
    intent: 'billing_question', subCategory: '',
    keywords: ['bill', 'billing', 'invoice', 'charged', 'payment', 'overcharged', 'refund', 'receipt'],
    phrases:  ['question about my bill', 'why was i charged', 'need a receipt', 'billing issue',
               'about my bill', 'my invoice', 'my payment'],
    weight: 1.5,   // boost so billing beats general_question when "question" + "bill" both present
  },

  // ── General question ──────────────────────────────────────────────────────
  {
    intent: 'general_question', subCategory: '',
    keywords: ['question', 'wondering', 'curious', 'information', 'how does', 'what is', 'tell me about',
               'do you', 'can you', 'are you'],
    phrases:  ['i have a question', 'just wondering', 'want to know'],
    weight: 0.8,
  },

  // ── Employment ────────────────────────────────────────────────────────────
  {
    intent: 'employment', subCategory: '',
    keywords: ['job', 'hiring', 'employment', 'apply', 'career', 'work for you', 'position', 'opening'],
    phrases:  ['looking for a job', 'are you hiring', 'apply for a position', 'want to work'],
    weight: 1,
  },

  // ── Complaint ────────────────────────────────────────────────────────────
  {
    intent: 'complaint', subCategory: '',
    keywords: ['complaint', 'unhappy', 'disappointed', 'terrible', 'awful', 'unacceptable', 'worst',
               'never again', 'bad service', 'poor job', 'not satisfied'],
    phrases:  ['very unhappy', 'worst experience', 'not acceptable', 'want to complain'],
    weight: 1.5,
  },

  // ── Human representative ──────────────────────────────────────────────────
  {
    intent: 'human_representative', subCategory: '',
    keywords: ['human', 'agent', 'person', 'representative', 'manager', 'supervisor', 'real person',
               'speak to someone', 'talk to a person'],
    phrases:  ['speak to a human', 'talk to a person', 'want a real person', 'connect me with someone'],
    weight: 2,   // must win when present
  },
];

// ─── Blueprint mappings ───────────────────────────────────────────────────────

export const DEFAULT_BLUEPRINT_MAPPINGS: readonly BlueprintMapping[] = [
  // HVAC
  { industry: 'hvac', intent: 'book_appointment',    blueprintId: 'hvac.booking',       priority: 10 },
  { industry: 'hvac', intent: 'request_estimate',    blueprintId: 'hvac.estimate',      priority: 10 },
  { industry: 'hvac', intent: 'emergency_service',   blueprintId: 'hvac.emergency',     priority: 20 },
  { industry: 'hvac', intent: 'repair',              blueprintId: 'hvac.repair',        priority: 10 },
  { industry: 'hvac', intent: 'installation',        blueprintId: 'hvac.installation',  priority: 10 },
  { industry: 'hvac', intent: 'maintenance',         blueprintId: 'hvac.maintenance',   priority: 10 },
  { industry: 'hvac', intent: 'inspection',          blueprintId: 'hvac.inspection',    priority: 10 },

  // Plumbing
  { industry: 'plumbing', intent: 'emergency_service', blueprintId: 'plumbing.emergency', priority: 20 },
  { industry: 'plumbing', intent: 'repair',            blueprintId: 'plumbing.repair',    priority: 10 },
  { industry: 'plumbing', intent: 'installation',      blueprintId: 'plumbing.install',   priority: 10 },
  { industry: 'plumbing', intent: 'book_appointment',  blueprintId: 'plumbing.booking',   priority: 10 },

  // Roofing
  { industry: 'roofing', intent: 'request_estimate',  blueprintId: 'roofing.estimate',   priority: 10 },
  { industry: 'roofing', intent: 'emergency_service', blueprintId: 'roofing.emergency',  priority: 20 },
  { industry: 'roofing', intent: 'repair',            blueprintId: 'roofing.repair',     priority: 10 },
  { industry: 'roofing', intent: 'inspection',        blueprintId: 'roofing.inspection', priority: 10 },

  // Electrical
  { industry: 'electrical', intent: 'emergency_service', blueprintId: 'electrical.emergency', priority: 20 },
  { industry: 'electrical', intent: 'repair',            blueprintId: 'electrical.repair',    priority: 10 },
  { industry: 'electrical', intent: 'installation',      blueprintId: 'electrical.install',   priority: 10 },
  { industry: 'electrical', intent: 'book_appointment',  blueprintId: 'electrical.booking',   priority: 10 },

  // Wildcard — cross-industry defaults (lowest priority, overridden by specific)
  { industry: '*', intent: 'book_appointment',    blueprintId: 'generic.booking',    priority: 0 },
  { industry: '*', intent: 'request_estimate',    blueprintId: 'generic.estimate',   priority: 0 },
  { industry: '*', intent: 'emergency_service',   blueprintId: 'generic.emergency',  priority: 0 },
  { industry: '*', intent: 'repair',              blueprintId: 'generic.repair',     priority: 0 },
  { industry: '*', intent: 'complaint',           blueprintId: 'generic.complaint',  priority: 0 },
  { industry: '*', intent: 'human_representative',blueprintId: 'generic.escalation', priority: 0 },
  { industry: '*', intent: 'billing_question',    blueprintId: 'generic.billing',    priority: 0 },
  { industry: '*', intent: 'general_question',    blueprintId: 'generic.faq',        priority: 0 },
  { industry: '*', intent: 'employment',          blueprintId: 'generic.employment', priority: 0 },
  { industry: '*', intent: 'unknown',             blueprintId: 'generic.greeting',   priority: 0 },
];
