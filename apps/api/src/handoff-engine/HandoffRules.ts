/**
 * handoff-engine/HandoffRules.ts
 *
 * Default routing rules mapping escalation reasons to destinations + priorities.
 * These are the out-of-the-box defaults; businesses can override via HandoffPolicy.
 *
 * PURE — no I/O, no side effects.
 */

import type { EscalationReason, HandoffDestination, HandoffPriority, RoutingRule } from './types';

// ─── Default routing table ────────────────────────────────────────────────────

export const DEFAULT_ROUTING_RULES: readonly RoutingRule[] = [
  { reason: 'customer_requested_human',       destination: 'customer_support',    priority: 'high',     enabled: true },
  { reason: 'low_ai_confidence',              destination: 'customer_support',    priority: 'normal',   enabled: true },
  { reason: 'repeated_clarification_failure', destination: 'customer_support',    priority: 'normal',   enabled: true },
  { reason: 'complaint_detected',             destination: 'manager',             priority: 'high',     enabled: true },
  { reason: 'frustration_detected',           destination: 'customer_support',    priority: 'high',     enabled: true },
  { reason: 'billing_question',               destination: 'billing_department',  priority: 'normal',   enabled: true },
  { reason: 'legal_issue',                    destination: 'manager',             priority: 'critical', enabled: true },
  { reason: 'payment_issue',                  destination: 'billing_department',  priority: 'high',     enabled: true },
  { reason: 'profanity_detected',             destination: 'manager',             priority: 'high',     enabled: true },
  { reason: 'unsupported_request',            destination: 'customer_support',    priority: 'normal',   enabled: true },
  { reason: 'business_rule',                  destination: 'customer_support',    priority: 'normal',   enabled: true },
  { reason: 'booking_completed',              destination: 'customer_support',    priority: 'low',      enabled: true },
  { reason: 'emergency_escalation',           destination: 'dispatcher',          priority: 'critical', enabled: true },
  { reason: 'vip_customer',                   destination: 'sales_team',          priority: 'high',     enabled: true },
  { reason: 'office_hours_only',              destination: 'customer_support',    priority: 'normal',   enabled: true },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const HandoffRules = {

  /**
   * Find the routing rule for a given reason.
   * Falls back to the default destination/priority if no rule matches.
   */
  findRule(
    reason:  EscalationReason,
    rules:   readonly RoutingRule[] = DEFAULT_ROUTING_RULES,
  ): RoutingRule | null {
    return rules.find(r => r.reason === reason && r.enabled) ?? null;
  },

  /**
   * Get destination for a reason, using custom rules first then defaults.
   */
  resolveDestination(
    reason:      EscalationReason,
    customRules: readonly RoutingRule[] = [],
    fallback:    HandoffDestination = 'customer_support',
  ): HandoffDestination {
    const custom  = HandoffRules.findRule(reason, customRules);
    if (custom) return custom.destination;
    const dflt    = HandoffRules.findRule(reason, DEFAULT_ROUTING_RULES);
    return dflt?.destination ?? fallback;
  },

  /**
   * Get priority for a reason.
   */
  resolvePriority(
    reason:      EscalationReason,
    customRules: readonly RoutingRule[] = [],
    fallback:    HandoffPriority = 'normal',
  ): HandoffPriority {
    const custom = HandoffRules.findRule(reason, customRules);
    if (custom) return custom.priority;
    const dflt   = HandoffRules.findRule(reason, DEFAULT_ROUTING_RULES);
    return dflt?.priority ?? fallback;
  },

  /** Returns the complete default policy (used when business hasn't customised). */
  defaultPolicy(): import('./types').HandoffPolicy {
    return {
      rules:                     DEFAULT_ROUTING_RULES,
      defaultDestination:        'customer_support',
      defaultPriority:           'normal',
      officeHoursOnly:           false,
      alwaysHandoffAfterBooking: false,
      maxClarificationAttempts:  3,
      confidenceThreshold:       30,
    };
  },
};
