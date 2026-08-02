/**
 * conversation-engine/blueprints/default-blueprints.ts
 *
 * Built-in blueprints covering all core service industries.
 * Pure data — no business logic.
 * Validated by ConversationBlueprintSchema at load time.
 */

import type { ConversationBlueprint } from '../types';

// ─── Shared recovery strategy ─────────────────────────────────────────────────

const STD_RECOVERY = {
  onAmbiguity:     'clarify_intent'     as const,
  onRepeat:        'clarify_intent'     as const,
  onContradiction: 'clarify_intent'     as const,
  onTopicChange:   'build_rapport'      as const,
  preserveContext: true,
};

// ─── Shared emergency rules (applied to every blueprint) ─────────────────────

const EMERGENCY_RULES = [
  {
    id: 'rule_critical_urgency', trigger: 'urgency_critical' as const,
    action: 'skip_to_booking' as const, targetObjective: 'handle_emergency' as const,
    priority: 100, enabled: true,
  },
  {
    id: 'rule_emergency_urgency', trigger: 'urgency_emergency' as const,
    action: 'skip_to_booking' as const, targetObjective: 'handle_emergency' as const,
    priority: 90, enabled: true,
  },
  {
    id: 'rule_human_request', trigger: 'customer_wants_human' as const,
    action: 'escalate_immediately' as const, targetObjective: 'escalate_to_human' as const,
    priority: 95, enabled: true,
  },
  {
    id: 'rule_business_closed', trigger: 'business_closed' as const,
    action: 'offer_next_slot' as const, targetObjective: 'offer_appointment' as const,
    priority: 80, enabled: true,
  },
  {
    id: 'rule_complaint', trigger: 'intent_complaint' as const,
    action: 'escalate_immediately' as const, targetObjective: 'handle_complaint' as const,
    priority: 85, enabled: true,
  },
  {
    id: 'rule_billing', trigger: 'intent_billing' as const,
    action: 'set_objective' as const, targetObjective: 'handle_billing' as const,
    priority: 70, enabled: true,
  },
];

// ─── HVAC Repair Blueprint ────────────────────────────────────────────────────

export const HVAC_REPAIR_BLUEPRINT: ConversationBlueprint = {
  id: 'hvac.repair',
  name: 'HVAC Repair',
  industry: 'hvac',
  intentCategory: 'repair',
  defaultStageId: 'greet',
  rules: EMERGENCY_RULES,
  branches: [
    { id: 'branch_emergency', condition: "urgency === 'critical' || urgency === 'emergency'",
      blueprintId: 'hvac.emergency', priority: 100 },
  ],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['hvac', 'repair'] },
  stages: [
    { id: 'greet',          objective: 'build_rapport',           requiredFields: [],            optionalFields: [], completionCriteria: ['visitorNameCollected'], allowedTools: [],                    transitions: [{ condition: 'visitorNameCollected', targetId: 'collect_service', priority: 1 }],                    recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'collect_service',objective: 'collect_service_details', requiredFields: ['service'],   optionalFields: [], completionCriteria: ['serviceCollected'],      allowedTools: [],                    transitions: [{ condition: 'serviceCollected', targetId: 'collect_emergency', priority: 1 }],                   recoveryStrategy: STD_RECOVERY, skipWhen: ['serviceCollected'], exitConditions: [] },
    { id: 'collect_emergency', objective: 'collect_emergency_details', requiredFields: ['emergency'], optionalFields: [], completionCriteria: ['emergencyCollected'], allowedTools: [],               transitions: [{ condition: 'emergencyCollected', targetId: 'collect_phone', priority: 1 }],                     recoveryStrategy: STD_RECOVERY, skipWhen: ['emergencyCollected'], exitConditions: [] },
    { id: 'collect_phone',  objective: 'collect_phone',           requiredFields: ['phone'],     optionalFields: [], completionCriteria: ['phoneCollected'],         allowedTools: ['create_lead'],       transitions: [{ condition: 'phoneCollected', targetId: 'collect_address', priority: 1 }],                      recoveryStrategy: STD_RECOVERY, skipWhen: ['phoneCollected'], exitConditions: [] },
    { id: 'collect_address',objective: 'collect_address',         requiredFields: ['address'],   optionalFields: [], completionCriteria: ['addressCollected'],       allowedTools: [],                    transitions: [{ condition: 'addressCollected', targetId: 'offer_appointment', priority: 1 }],                  recoveryStrategy: STD_RECOVERY, skipWhen: ['addressCollected'], exitConditions: [] },
    { id: 'offer_appointment', objective: 'offer_appointment',    requiredFields: ['appointment'],optionalFields:[], completionCriteria: ['appointmentCollected'],    allowedTools: ['check_availability','book_appointment'], transitions: [{ condition: 'appointmentCollected', targetId: 'confirm', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'confirm',        objective: 'confirm_appointment',     requiredFields: [],            optionalFields: [], completionCriteria: ['booking_confirmed'],       allowedTools: ['book_appointment','send_sms'], transitions: [{ condition: 'booking_confirmed', targetId: 'done', priority: 1 }],            recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'done',           objective: 'complete_conversation',   requiredFields: [],            optionalFields: [], completionCriteria: [],                          allowedTools: [],                    transitions: [],                                                                                              recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── HVAC Emergency Blueprint ─────────────────────────────────────────────────

export const HVAC_EMERGENCY_BLUEPRINT: ConversationBlueprint = {
  id: 'hvac.emergency',
  name: 'HVAC Emergency Dispatch',
  industry: 'hvac',
  intentCategory: 'emergency_service',
  defaultStageId: 'emergency_triage',
  rules: [
    { id: 'rule_human_emergency', trigger: 'customer_wants_human' as const, action: 'escalate_immediately' as const, targetObjective: 'escalate_to_human' as const, priority: 100, enabled: true },
  ],
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['hvac', 'emergency'] },
  stages: [
    { id: 'emergency_triage', objective: 'handle_emergency',      requiredFields: [],         optionalFields: [], completionCriteria: ['phoneCollected'],   allowedTools: ['create_lead'],             transitions: [{ condition: 'phoneCollected', targetId: 'emergency_collect_address', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'emergency_collect_address', objective: 'collect_address', requiredFields: ['address'], optionalFields:[], completionCriteria: ['addressCollected'], allowedTools: [],                       transitions: [{ condition: 'addressCollected', targetId: 'emergency_book', priority: 1 }],           recoveryStrategy: STD_RECOVERY, skipWhen: ['addressCollected'], exitConditions: [] },
    { id: 'emergency_book',   objective: 'offer_appointment',     requiredFields: [],         optionalFields: [], completionCriteria: ['booking_confirmed'],  allowedTools: ['check_availability','book_appointment','send_sms'], transitions: [{ condition: 'booking_confirmed', targetId: 'emergency_done', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'emergency_done',   objective: 'complete_conversation', requiredFields: [],         optionalFields: [], completionCriteria: [],                     allowedTools: [],                         transitions: [],                                                                                   recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── HVAC Booking Blueprint ───────────────────────────────────────────────────

export const HVAC_BOOKING_BLUEPRINT: ConversationBlueprint = {
  id: 'hvac.booking',
  name: 'HVAC Appointment Booking',
  industry: 'hvac',
  intentCategory: 'book_appointment',
  defaultStageId: 'greet',
  rules: EMERGENCY_RULES,
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['hvac', 'booking'] },
  stages: [
    { id: 'greet',           objective: 'build_rapport',           requiredFields: [],         optionalFields: [], completionCriteria: ['visitorNameCollected'], allowedTools: [],                    transitions: [{ condition: 'visitorNameCollected', targetId: 'collect_service', priority: 1 }],               recoveryStrategy: STD_RECOVERY, skipWhen: ['visitorNameCollected'], exitConditions: [] },
    { id: 'collect_service', objective: 'collect_service_details', requiredFields: ['service'], optionalFields: [], completionCriteria: ['serviceCollected'],    allowedTools: [],                    transitions: [{ condition: 'serviceCollected', targetId: 'collect_phone', priority: 1 }],                    recoveryStrategy: STD_RECOVERY, skipWhen: ['serviceCollected'], exitConditions: [] },
    { id: 'collect_phone',   objective: 'collect_phone',           requiredFields: ['phone'],   optionalFields: [], completionCriteria: ['phoneCollected'],      allowedTools: ['create_lead'],       transitions: [{ condition: 'phoneCollected', targetId: 'offer_appointment', priority: 1 }],                  recoveryStrategy: STD_RECOVERY, skipWhen: ['phoneCollected'], exitConditions: [] },
    { id: 'offer_appointment',objective: 'offer_appointment',      requiredFields: [],          optionalFields: [], completionCriteria: ['appointmentCollected'],allowedTools: ['check_availability','book_appointment'], transitions: [{ condition: 'appointmentCollected', targetId: 'done', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'done',            objective: 'complete_conversation',   requiredFields: [],          optionalFields: [], completionCriteria: [],                      allowedTools: [],                    transitions: [],                                                                                              recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── Generic FAQ Blueprint ────────────────────────────────────────────────────

export const GENERIC_FAQ_BLUEPRINT: ConversationBlueprint = {
  id: 'generic.faq',
  name: 'General FAQ',
  industry: '*',
  intentCategory: 'general_question',
  defaultStageId: 'answer',
  rules: [
    { id: 'rule_human_faq', trigger: 'customer_wants_human' as const, action: 'escalate_immediately' as const, targetObjective: 'escalate_to_human' as const, priority: 100, enabled: true },
  ],
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['generic', 'faq'] },
  stages: [
    { id: 'answer', objective: 'answer_question',       requiredFields: [], optionalFields: [], completionCriteria: [], allowedTools: ['lookup_faq'], transitions: [{ condition: 'answered', targetId: 'capture_lead', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'capture_lead', objective: 'collect_phone',   requiredFields: ['phone'], optionalFields: [], completionCriteria: ['phoneCollected'], allowedTools: ['create_lead'], transitions: [{ condition: 'phoneCollected', targetId: 'done', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: ['phoneCollected'], exitConditions: [] },
    { id: 'done', objective: 'complete_conversation',   requiredFields: [], optionalFields: [], completionCriteria: [], allowedTools: [], transitions: [], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── Generic Escalation Blueprint ────────────────────────────────────────────

export const GENERIC_ESCALATION_BLUEPRINT: ConversationBlueprint = {
  id: 'generic.escalation',
  name: 'Human Escalation',
  industry: '*',
  intentCategory: 'human_representative',
  defaultStageId: 'escalate',
  rules: [],
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['generic', 'escalation'] },
  stages: [
    { id: 'escalate', objective: 'escalate_to_human', requiredFields: [], optionalFields: [], completionCriteria: [], allowedTools: ['escalate', 'send_sms'], transitions: [], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── Generic Estimate Blueprint ──────────────────────────────────────────────

export const GENERIC_ESTIMATE_BLUEPRINT: ConversationBlueprint = {
  id: 'generic.estimate',
  name: 'Service Estimate',
  industry: '*',
  intentCategory: 'request_estimate',
  defaultStageId: 'collect_service',
  rules: EMERGENCY_RULES,
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['generic', 'estimate'] },
  stages: [
    { id: 'collect_service', objective: 'collect_service_details', requiredFields: ['service'], optionalFields: [], completionCriteria: ['serviceCollected'], allowedTools: [], transitions: [{ condition: 'serviceCollected', targetId: 'collect_phone', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: ['serviceCollected'], exitConditions: [] },
    { id: 'collect_phone',   objective: 'collect_phone',           requiredFields: ['phone'],   optionalFields: [], completionCriteria: ['phoneCollected'],   allowedTools: ['create_lead'], transitions: [{ condition: 'phoneCollected', targetId: 'provide_estimate', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: ['phoneCollected'], exitConditions: [] },
    { id: 'provide_estimate',objective: 'provide_estimate',        requiredFields: [],          optionalFields: [], completionCriteria: [],                   allowedTools: ['get_estimate'], transitions: [{ condition: 'estimate_sent', targetId: 'done', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'done',            objective: 'complete_conversation',   requiredFields: [],          optionalFields: [], completionCriteria: [],                   allowedTools: [], transitions: [], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── Plumbing Emergency Blueprint ────────────────────────────────────────────

export const PLUMBING_EMERGENCY_BLUEPRINT: ConversationBlueprint = {
  id: 'plumbing.emergency',
  name: 'Plumbing Emergency Dispatch',
  industry: 'plumbing',
  intentCategory: 'emergency_service',
  defaultStageId: 'triage',
  rules: [
    { id: 'rule_human_plumbing', trigger: 'customer_wants_human' as const, action: 'escalate_immediately' as const, targetObjective: 'escalate_to_human' as const, priority: 100, enabled: true },
  ],
  branches: [],
  metadata: { version: '1.0.0', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', tags: ['plumbing', 'emergency'] },
  stages: [
    { id: 'triage', objective: 'handle_emergency',      requiredFields: [], optionalFields: [], completionCriteria: ['phoneCollected'], allowedTools: ['create_lead'],                           transitions: [{ condition: 'phoneCollected', targetId: 'collect_address', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'collect_address', objective: 'collect_address', requiredFields: ['address'], optionalFields: [], completionCriteria: ['addressCollected'], allowedTools: [],                         transitions: [{ condition: 'addressCollected', targetId: 'book', priority: 1 }],          recoveryStrategy: STD_RECOVERY, skipWhen: ['addressCollected'], exitConditions: [] },
    { id: 'book', objective: 'offer_appointment',       requiredFields: [], optionalFields: [], completionCriteria: ['booking_confirmed'], allowedTools: ['check_availability','book_appointment','send_sms'], transitions: [{ condition: 'booking_confirmed', targetId: 'done', priority: 1 }], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
    { id: 'done', objective: 'complete_conversation',   requiredFields: [], optionalFields: [], completionCriteria: [], allowedTools: [], transitions: [], recoveryStrategy: STD_RECOVERY, skipWhen: [], exitConditions: [] },
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const DEFAULT_BLUEPRINTS: readonly ConversationBlueprint[] = Object.freeze([
  HVAC_REPAIR_BLUEPRINT,
  HVAC_EMERGENCY_BLUEPRINT,
  HVAC_BOOKING_BLUEPRINT,
  GENERIC_FAQ_BLUEPRINT,
  GENERIC_ESCALATION_BLUEPRINT,
  GENERIC_ESTIMATE_BLUEPRINT,
  PLUMBING_EMERGENCY_BLUEPRINT,
]);
