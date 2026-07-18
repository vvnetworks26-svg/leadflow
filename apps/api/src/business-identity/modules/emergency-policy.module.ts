/**
 * business-identity/modules/emergency-policy.module.ts
 *
 * Maps service descriptions and user messages to emergency priorities.
 * Pure functions — no side effects.
 */

import type { EmergencyPolicy, EmergencyTrigger } from '../types';

export type EmergencyPriority = 'critical' | 'high' | 'standard' | 'none';

/**
 * Scans `text` against all configured triggers.
 * Returns the highest-priority match, or 'none' if no trigger fires.
 */
export function detectEmergencyPriority(
  policy: EmergencyPolicy,
  text: string,
): EmergencyPriority {
  if (!policy.enabled) return 'none';

  const lower = text.toLowerCase();
  let result: EmergencyPriority = 'none';

  for (const trigger of policy.triggers) {
    if (lower.includes(trigger.keyword.toLowerCase())) {
      result = higherPriority(result, trigger.priority);
      if (result === 'critical') break;   // can't go higher
    }
  }

  return result;
}

/** Returns true when the text matches any configured emergency trigger */
export function isEmergency(policy: EmergencyPolicy, text: string): boolean {
  return detectEmergencyPriority(policy, text) !== 'none';
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<EmergencyPriority, number> = {
  none: 0, standard: 1, high: 2, critical: 3,
};

function higherPriority(a: EmergencyPriority, b: EmergencyTrigger['priority']): EmergencyPriority {
  return PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a;
}
