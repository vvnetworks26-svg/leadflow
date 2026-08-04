/**
 * handoff-engine/HandoffEngine.ts
 *
 * Layer 9 — Public entry point.
 *
 * Usage after Validation Engine:
 *
 *   const handoffResult = HandoffEngine.evaluate({
 *     organizationId, conversationId,
 *     memory: richMemory,
 *     history,
 *     stage:           nextStage,
 *     urgency:         intent.urgency,
 *     intentCategory:  resolvedIntent.category,
 *     confidenceScore: resolvedIntent.confidence ?? 70,
 *     turnCount,
 *     identity,
 *     clarificationAttempts,
 *   });
 *
 *   if (handoffResult.shouldHandoff) {
 *     reply        = handoffResult.bridgeMessage;
 *     updatedStage = 'escalated';
 *     // handoffResult.context is ready for the human agent
 *   }
 *
 * The existing runOrchestrator() public API is unchanged.
 */

import type { EscalationInput, HandoffResult } from './types';
import { HandoffCoordinator } from './HandoffCoordinator';
import { EscalationDetector } from './EscalationDetector';

export const HandoffEngine = {

  /**
   * Evaluate whether a handoff is required for this conversation turn.
   * Synchronous. No network. No Gemini. p50 < 5ms.
   */
  evaluate(input: EscalationInput): HandoffResult {
    return HandoffCoordinator.evaluate(input);
  },

  /**
   * Quick check: does this message alone trigger a handoff?
   * Lighter-weight than evaluate() — useful for real-time checks.
   */
  isEscalationMessage(message: string): boolean {
    return EscalationDetector.isHumanRequest(message)
        || EscalationDetector.isComplaint(message);
  },

  /**
   * Check if the conversation should be handed off based on
   * urgency alone (emergency bypass).
   */
  isEmergencyHandoff(urgency: EscalationInput['urgency']): boolean {
    return urgency === 'critical' || urgency === 'emergency';
  },
};
