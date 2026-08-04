/**
 * handoff-engine/HandoffPolicy.ts
 *
 * Evaluates business-configured handoff policies.
 * Determines routing destination and priority from policy + reason.
 *
 * PURE — no I/O, no side effects.
 */

import type {
  HandoffPolicy,
  EscalationReason,
  HandoffDestination,
  HandoffPriority,
  EscalationInput,
} from './types';
import type { BusinessIdentity } from '../business-identity/types';
import { HandoffRules } from './HandoffRules';
import { BusinessHoursService } from '../booking-engine/BusinessHours';

export const HandoffPolicyEvaluator = {

  /**
   * Determine routing from policy + reason + context.
   */
  route(
    reason:  EscalationReason,
    policy:  HandoffPolicy,
    urgency: EscalationInput['urgency'] = 'normal',
  ): { destination: HandoffDestination; priority: HandoffPriority } {
    // Emergency always goes to dispatcher
    if (urgency === 'critical' || urgency === 'emergency') {
      return { destination: 'dispatcher', priority: 'critical' };
    }

    const destination = HandoffRules.resolveDestination(
      reason,
      policy.rules,
      policy.defaultDestination,
    );
    const priority = HandoffRules.resolvePriority(
      reason,
      policy.rules,
      policy.defaultPriority,
    );

    return { destination, priority };
  },

  /**
   * Build a HandoffPolicy from a BusinessIdentity's EscalationPolicy.
   * Businesses configure escalation triggers in their identity —
   * this maps those to routing rules.
   */
  fromIdentity(identity: BusinessIdentity): HandoffPolicy {
    const base = HandoffRules.defaultPolicy();

    // Incorporate business-configured confidence threshold
    return {
      ...base,
      confidenceThreshold: identity.escalationPolicy.confidenceThreshold,
    };
  },

  /**
   * Should this business operate AI-only during office hours?
   * After-hours with emergency disabled → always escalate.
   */
  requiresOfficeHoursHandoff(
    identity: BusinessIdentity,
    nowMs:    number = Date.now(),
  ): boolean {
    const isOpen = BusinessHoursService.isOpen(
      identity.businessHours,
      identity.contactInfo.timezone,
      nowMs,
    );
    // If closed and no emergency after-hours → need human
    return !isOpen && !identity.businessHours.emergencyAfterHours;
  },

  /**
   * Build bridge message — what the AI says to the customer before the handoff.
   */
  bridgeMessage(
    reason:       EscalationReason,
    destination:  HandoffDestination,
    identity:     BusinessIdentity,
    customerName: string | null,
  ): string {
    const biz  = identity.companyProfile.businessName;
    const name = customerName ? `, ${customerName}` : '';

    const messages: Partial<Record<EscalationReason, string>> = {
      customer_requested_human:       `Of course${name}. I'm connecting you with a ${biz} team member right now.`,
      complaint_detected:             `I'm sorry to hear that${name}. Let me connect you with a team member who can help resolve this.`,
      frustration_detected:           `I understand${name}. Let me get a ${biz} team member who can assist you directly.`,
      legal_issue:                    `I understand the seriousness of this${name}. I'm escalating to a ${biz} manager right away.`,
      billing_question:               `For billing questions${name}, I'll connect you with our office team who has access to your account.`,
      payment_issue:                  `For payment-related matters${name}, let me transfer you to our billing team.`,
      profanity_detected:             `I'm transferring you to a ${biz} team member who can assist you.`,
      low_ai_confidence:              `Let me connect you with a ${biz} team member who can better assist with your request${name}.`,
      repeated_clarification_failure: `I want to make sure you get the best help. Let me connect you with a ${biz} specialist${name}.`,
      emergency_escalation:           `This sounds urgent${name}. I'm connecting you with our dispatcher immediately.`,
      unsupported_request:            `This requires assistance from our team${name}. Connecting you now.`,
      office_hours_only:              `Our team is currently available during office hours. I'll make sure someone reaches out to you${name} as soon as possible.`,
    };

    return messages[reason]
      ?? (identity.escalationPolicy.escalationMessage || `Let me connect you with a ${biz} team member who can help you${name}.`);
  },
};
