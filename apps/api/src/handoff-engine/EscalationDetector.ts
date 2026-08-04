/**
 * handoff-engine/EscalationDetector.ts
 *
 * Detects whether a handoff is required based on conversation signals.
 * Evaluates triggers in priority order; returns the first matching reason.
 *
 * PURE — no I/O, no side effects.
 */

import type { EscalationInput, EscalationReason } from './types';

// ─── Pattern banks ────────────────────────────────────────────────────────────

const HUMAN_REQUEST_PATTERNS = [
  /speak (to|with) (a |an )?(person|human|agent|representative|someone|staff|manager)/i,
  /transfer me/i,
  /connect me (to|with)/i,
  /talk to (a |an )?(real |human |actual )?(person|human|agent|representative)/i,
  /I want (a |an )?(real |human |actual )?(person|someone|agent)/i,
  /real person/i,
  /human support/i,
  /customer service/i,
  /live (agent|support|chat|person)/i,
  /get (a |an )?(real|actual) (person|human|agent)/i,
];

const COMPLAINT_PATTERNS = [
  /this (isn'?t|is not) (helping|helpful|working|useful)/i,
  /I'?m (frustrated|fed up|annoyed|angry|upset|mad)/i,
  /this is (ridiculous|unacceptable|terrible|awful|useless|pathetic)/i,
  /waste of (my )?time/i,
  /not (helpful|useful)/i,
  /terrible (service|experience|support)/i,
  /very (unhappy|disappointed|frustrated)/i,
  /can'?t believe/i,
  /completely (useless|unhelpful|broken)/i,
  /horrible/i,
];

const FRUSTRATION_PATTERNS = [
  /you('?re| are) not (understanding|getting it|listening)/i,
  /I (already|just) (said|told you|mentioned)/i,
  /stop (asking|repeating)/i,
  /going (in circles|around in circles)/i,
  /we'?ve (been|going) (over|through) this/i,
  /same (question|thing) (over and over|again)/i,
];

const BILLING_PATTERNS = [
  /invoice/i,
  /payment (history|issue|problem|dispute)/i,
  /refund/i,
  /charge(d)?/i,
  /billing (issue|problem|question|dispute)/i,
  /account (balance|statement|history)/i,
  /overcharged/i,
  /credit card/i,
  /dispute (a )?charge/i,
];

const PROFANITY_PATTERNS = [
  /\bf+u+c+k+\b/i,
  /\bs+h+i+t+\b/i,
  /\bb+i+t+c+h+\b/i,
  /\ba+s+s+h+o+l+e+\b/i,
  /\bd+a+m+n+\b/i,
  /\bcrap\b/i,
  /\bwtf\b/i,
];

const LEGAL_PATTERNS = [
  /\b(sue|lawsuit|attorney|lawyer|legal action|court)\b/i,
  /contact (my )?(lawyer|attorney)/i,
  /take (you|this) to court/i,
  /legal (issue|matter|action)/i,
  /file (a )?complaint (with|to)/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function getLastUserMessages(input: EscalationInput, n = 3): string {
  return input.history
    .filter(m => m.role === 'user')
    .slice(-n)
    .map(m => m.content)
    .join(' ');
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export interface DetectionResult {
  readonly triggered:  boolean;
  readonly reason:     EscalationReason | null;
  readonly confidence: number;  // 0–100 how confident we are in this trigger
}

export const EscalationDetector = {

  /**
   * Run all trigger checks in priority order.
   * Returns the first matching escalation reason.
   */
  detect(input: EscalationInput): DetectionResult {
    const recent = getLastUserMessages(input, 3);
    const latest = input.history.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '';

    // Priority 1: explicit human request (highest priority — always honour)
    if (matchesAny(latest, HUMAN_REQUEST_PATTERNS) ||
        matchesAny(recent, HUMAN_REQUEST_PATTERNS) ||
        input.intentCategory === 'human_representative') {
      return { triggered: true, reason: 'customer_requested_human', confidence: 100 };
    }

    // Priority 2: legal issues
    if (matchesAny(latest, LEGAL_PATTERNS) || input.intentCategory === 'billing_question' && matchesAny(latest, LEGAL_PATTERNS)) {
      return { triggered: true, reason: 'legal_issue', confidence: 95 };
    }

    // Priority 3: profanity
    if (matchesAny(latest, PROFANITY_PATTERNS)) {
      return { triggered: true, reason: 'profanity_detected', confidence: 90 };
    }

    // Priority 4: complaint / frustration
    if (matchesAny(latest, COMPLAINT_PATTERNS) || input.intentCategory === 'complaint') {
      return { triggered: true, reason: 'complaint_detected', confidence: 85 };
    }

    if (matchesAny(latest, FRUSTRATION_PATTERNS) || matchesAny(recent, FRUSTRATION_PATTERNS)) {
      return { triggered: true, reason: 'frustration_detected', confidence: 80 };
    }

    // Priority 5: billing
    if (matchesAny(latest, BILLING_PATTERNS) || input.intentCategory === 'billing_question') {
      return { triggered: true, reason: 'billing_question', confidence: 80 };
    }

    // Priority 6: low AI confidence
    const threshold = input.identity.escalationPolicy.confidenceThreshold;
    if (input.confidenceScore < threshold) {
      return { triggered: true, reason: 'low_ai_confidence', confidence: 70 };
    }

    // Priority 7: repeated clarification failures
    const maxAttempts = 3; // default
    if ((input.clarificationAttempts ?? 0) >= maxAttempts) {
      return { triggered: true, reason: 'repeated_clarification_failure', confidence: 75 };
    }

    // Priority 8: business rule triggers from EscalationPolicy
    for (const trigger of input.identity.escalationPolicy.triggers) {
      const cat = input.intentCategory as string;
      if (trigger === 'customer_requests_human' && cat === 'human_representative') {
        return { triggered: true, reason: 'customer_requested_human', confidence: 100 };
      }
      if (trigger === 'complaint' && cat === 'complaint') {
        return { triggered: true, reason: 'complaint_detected', confidence: 85 };
      }
      if (trigger === 'payment_issue' && matchesAny(latest, BILLING_PATTERNS)) {
        return { triggered: true, reason: 'payment_issue', confidence: 80 };
      }
    }

    return { triggered: false, reason: null, confidence: 0 };
  },

  /** Quick check — does the message contain a human request? */
  isHumanRequest(message: string): boolean {
    return matchesAny(message, HUMAN_REQUEST_PATTERNS);
  },

  /** Quick check — does the message indicate frustration or complaint? */
  isComplaint(message: string): boolean {
    return matchesAny(message, COMPLAINT_PATTERNS) || matchesAny(message, FRUSTRATION_PATTERNS);
  },

  /** Quick check — does the message involve billing? */
  isBillingRelated(message: string): boolean {
    return matchesAny(message, BILLING_PATTERNS);
  },
};
