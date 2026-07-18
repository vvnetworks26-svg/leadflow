/**
 * business-identity/modules/escalation-policy.module.ts
 *
 * Determines whether a conversation should escalate to a human agent.
 * Pure functions — no side effects.
 */

import type { EscalationPolicy, EscalationTrigger } from '../types';

const ESCALATION_PATTERNS: Record<EscalationTrigger, RegExp> = {
  customer_requests_human: /\b(human|agent|person|representative|manager|speak\s+to\s+someone|talk\s+to\s+a\s+person|real\s+person)\b/i,
  complaint:               /\b(complaint|unacceptable|disappointed|terrible|awful|horrible|never\s+again|refund)\b/i,
  payment_issue:           /\b(billing|charged|overcharged|dispute|chargeback|invoice|payment\s+problem)\b/i,
  legal_issue:             /\b(lawyer|attorney|legal|lawsuit|sue|court|litigation)\b/i,
  low_confidence:          /.*/,   // handled separately via confidence score
  profanity:               /\b(f+u+c+k|s+h+i+t|b+i+t+c+h|a+s+s+h+o+l+e|d+a+m+n)\b/i,
  unsupported_request:     /.*/,   // handled separately
  repeated_failure:        /.*/,   // handled separately
};

/**
 * Returns true if the message text triggers any configured escalation rule.
 * Confidence-based and structural triggers (low_confidence, repeated_failure,
 * unsupported_request) must be checked separately via `shouldEscalateOnScore`.
 */
export function shouldEscalateOnMessage(
  policy:  EscalationPolicy,
  message: string,
): boolean {
  const textTriggers: EscalationTrigger[] = [
    'customer_requests_human',
    'complaint',
    'payment_issue',
    'legal_issue',
    'profanity',
  ];

  return textTriggers
    .filter(t => policy.triggers.includes(t))
    .some(t => ESCALATION_PATTERNS[t].test(message));
}

/**
 * Returns true when the AI's confidence score falls below the configured threshold.
 */
export function shouldEscalateOnScore(
  policy:     EscalationPolicy,
  confidence: number,
): boolean {
  if (!policy.triggers.includes('low_confidence')) return false;
  return confidence < policy.confidenceThreshold;
}
