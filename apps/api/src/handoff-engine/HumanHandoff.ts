/**
 * handoff-engine/HumanHandoff.ts
 *
 * Executes the full AI-to-human handoff lifecycle:
 *   1. Build summary
 *   2. Build agent context
 *   3. Emit event
 *   4. Return HandoffResult
 *
 * PURE — no network, no DB, no side effects (event bus is fire-and-forget).
 */

import type {
  EscalationInput,
  EscalationReason,
  HandoffResult,
} from './types';
import { ConversationSummarizer }  from './ConversationSummarizer';
import { ContextBuilder }          from './ContextBuilder';
import { HandoffEventBuilder, HandoffEventBus } from './HandoffEventBuilder';
import { HandoffPolicyEvaluator }  from './HandoffPolicy';
import { HandoffRules }            from './HandoffRules';

// ─── Handoff ID generator (deterministic) ─────────────────────────────────────

function buildHandoffId(conversationId: string, reason: string, nowMs: number): string {
  const input = `${conversationId}|${reason}|${nowMs}`;
  let   hash  = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash  = (hash * 0x01000193) >>> 0;
  }
  return `hnd-${hash.toString(16).padStart(8, '0')}`;
}

// ─── Human Handoff ────────────────────────────────────────────────────────────

export const HumanHandoff = {

  /**
   * Execute the handoff and return a complete HandoffResult.
   * Emits the handoff_requested event (fire-and-forget).
   */
  execute(
    input:  EscalationInput,
    reason: EscalationReason,
  ): HandoffResult {
    const nowMs   = input.nowMs ?? Date.now();
    const policy  = HandoffPolicyEvaluator.fromIdentity(input.identity);

    // Resolve routing
    const { destination, priority } = HandoffPolicyEvaluator.route(
      reason, policy, input.urgency,
    );

    // Build summary (deterministic, from memory)
    const summary = ConversationSummarizer.summarize(input, reason);

    // Build agent context
    const handoffId = buildHandoffId(input.conversationId, reason, nowMs);
    const context   = ContextBuilder.build({
      summary,
      input,
      destination,
      priority,
      handoffId,
    });

    // Build bridge message (what the AI tells the customer)
    const bridgeMessage = HandoffPolicyEvaluator.bridgeMessage(
      reason,
      destination,
      input.identity,
      input.memory.visitorName,
    );

    // Emit event (fire-and-forget — Layer 10 Analytics consumes this)
    const event = HandoffEventBuilder.requested({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      reason,
      priority,
      destination,
      summary,
      nowMs,
    });
    HandoffEventBus.emit(event);

    // Emit specific sub-events for analytics granularity
    if (reason === 'customer_requested_human') {
      HandoffEventBus.emit(HandoffEventBuilder.humanRequested({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        reason, priority, destination, summary, nowMs,
      }));
    }

    if (reason === 'complaint_detected' || reason === 'frustration_detected') {
      HandoffEventBus.emit(HandoffEventBuilder.complaintDetected({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        reason, priority, destination, summary, nowMs,
      }));
    }

    if (reason === 'low_ai_confidence' || reason === 'repeated_clarification_failure') {
      HandoffEventBus.emit(HandoffEventBuilder.confidenceLow({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        reason, priority, destination, summary, nowMs,
      }));
    }

    return {
      shouldHandoff: true,
      reason,
      priority,
      destination,
      summary,
      context,
      event,
      bridgeMessage,
    };
  },

  /** Build a "no handoff needed" result. */
  noHandoff(): HandoffResult {
    return {
      shouldHandoff: false,
      reason:        null,
      priority:      'normal',
      destination:   'customer_support',
      bridgeMessage: '',
    };
  },
};
