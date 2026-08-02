/**
 * business-identity/modules/permissions.module.ts
 *
 * Granular AI permission checks.
 * Pure functions — no side effects.
 */

import type { AiPermissions, AiPermission, AiRestriction } from '../types';

/** Returns true when the AI is allowed to perform the given action */
export function isPermitted(perms: AiPermissions, action: AiPermission): boolean {
  return perms.allowed.includes(action);
}

/** Returns true when the AI is explicitly denied from performing the action */
export function isDenied(perms: AiPermissions, action: AiRestriction): boolean {
  return perms.denied.includes(action);
}

/**
 * Returns a human-readable explanation of why the AI cannot perform
 * a denied action — for use in escalation messages.
 */
export function getDenialReason(action: AiRestriction): string {
  const reasons: Record<AiRestriction, string> = {
    negotiate_pricing:     'I\'m not able to negotiate pricing — please speak with our team for custom quotes.',
    diagnose_equipment:    'I\'m not able to diagnose equipment remotely — a technician visit is required.',
    promise_arrival_time:  'I\'m unable to guarantee an exact arrival time — the technician will confirm closer to the appointment.',
    give_legal_advice:     'I\'m not able to provide legal advice — please consult a qualified attorney.',
    give_medical_advice:   'I\'m not able to provide medical advice — please contact a healthcare professional.',
    give_financial_advice: 'I\'m not able to provide financial advice — please speak with a financial advisor.',
  };
  return reasons[action] ?? 'I\'m unable to help with that — let me connect you with our team.';
}
