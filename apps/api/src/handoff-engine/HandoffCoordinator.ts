/**
 * handoff-engine/HandoffCoordinator.ts
 *
 * Coordinates the full escalation decision pipeline:
 *   1. Check business policy rules (office hours, post-booking, VIP)
 *   2. Run EscalationDetector (message-based triggers)
 *   3. Run ConfidenceEvaluator (low confidence / stalled conversation)
 *   4. If escalation needed → HumanHandoff.execute()
 *   5. Return HandoffResult
 *
 * PURE — no I/O, no network, no DB.
 */

import type { EscalationInput, HandoffResult, EscalationReason } from './types';
import { EscalationDetector }      from './EscalationDetector';
import { ConfidenceEvaluator }     from './ConfidenceEvaluator';
import { HandoffPolicyEvaluator }  from './HandoffPolicy';
import { HumanHandoff }            from './HumanHandoff';

export const HandoffCoordinator = {

  /**
   * Evaluate whether a handoff is required for this conversation turn.
   * Returns a HandoffResult — either shouldHandoff=true with full context,
   * or shouldHandoff=false.
   */
  evaluate(input: EscalationInput): HandoffResult {
    const nowMs  = input.nowMs ?? Date.now();
    const policy = HandoffPolicyEvaluator.fromIdentity(input.identity);

    // ── Step 1: Office hours check ──────────────────────────────────────────
    if (HandoffPolicyEvaluator.requiresOfficeHoursHandoff(input.identity, nowMs)) {
      return HumanHandoff.execute(input, 'office_hours_only');
    }

    // ── Step 2: Post-booking handoff (business-configured) ──────────────────
    if (policy.alwaysHandoffAfterBooking && input.memory.bookingStatus === 'booked') {
      return HumanHandoff.execute(input, 'booking_completed');
    }

    // ── Step 3: Emergency urgency ────────────────────────────────────────────
    if (input.urgency === 'critical' || input.urgency === 'emergency') {
      return HumanHandoff.execute(input, 'emergency_escalation');
    }

    // ── Step 4: Message-based escalation detection ───────────────────────────
    const detection = EscalationDetector.detect(input);
    if (detection.triggered && detection.reason) {
      return HumanHandoff.execute(input, detection.reason);
    }

    // ── Step 5: Confidence evaluation ────────────────────────────────────────
    const confResult = ConfidenceEvaluator.evaluate({
      rawScore:              input.confidenceScore,
      confidenceLevel:       mapScoreToLevel(input.confidenceScore),
      stage:                 input.stage,
      clarificationAttempts: input.clarificationAttempts ?? 0,
      policyThreshold:       policy.confidenceThreshold,
      maxClarificationAttempts: policy.maxClarificationAttempts,
    });

    if (confResult.shouldEscalate) {
      const reason: EscalationReason =
        (input.clarificationAttempts ?? 0) >= policy.maxClarificationAttempts
          ? 'repeated_clarification_failure'
          : 'low_ai_confidence';
      return HumanHandoff.execute(input, reason);
    }

    // No handoff needed
    return HumanHandoff.noHandoff();
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function mapScoreToLevel(score: number): import('../intent-engine/types').ConfidenceLevel {
  if (score >= 90) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'unknown';
}
