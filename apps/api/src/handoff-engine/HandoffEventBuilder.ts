/**
 * handoff-engine/HandoffEventBuilder.ts
 *
 * Builds deterministic HandoffEvent objects for all 6 event types.
 * These events feed Layer 10 Analytics.
 *
 * PURE — no I/O, no side effects.
 */

import type {
  HandoffEvent,
  HandoffEventType,
  HandoffSummary,
  EscalationReason,
  HandoffDestination,
  HandoffPriority,
} from './types';

// ─── Param type ───────────────────────────────────────────────────────────────

interface BuildParams {
  organizationId: string;
  conversationId: string;
  reason:         EscalationReason;
  priority:       HandoffPriority;
  destination:    HandoffDestination;
  summary?:       HandoffSummary;
  nowMs?:         number;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export const HandoffEventBuilder = {

  build(params: {
    type:           HandoffEventType;
    organizationId: string;
    conversationId: string;
    reason:         EscalationReason;
    priority:       HandoffPriority;
    destination:    HandoffDestination;
    summary?:       HandoffSummary;
    nowMs?:         number;
  }): HandoffEvent {
    return Object.freeze({
      type:           params.type,
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      reason:         params.reason,
      priority:       params.priority,
      destination:    params.destination,
      summary:        params.summary,
      occurredAt:     new Date(params.nowMs ?? Date.now()).toISOString(),
    });
  },

  requested(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'handoff_requested' });
  },

  completed(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'handoff_completed' });
  },

  cancelled(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'handoff_cancelled' });
  },

  humanRequested(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'human_requested' });
  },

  confidenceLow(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'ai_confidence_low' });
  },

  complaintDetected(params: BuildParams): HandoffEvent {
    return HandoffEventBuilder.build({ ...params, type: 'complaint_detected' });
  },
};

// ─── Event registry (fire-and-forget) ────────────────────────────────────────

type HandoffEventHandler = (event: HandoffEvent) => void;
const _handlers: HandoffEventHandler[] = [];

export const HandoffEventBus = {
  on(handler: HandoffEventHandler): void {
    _handlers.push(handler);
  },
  off(handler: HandoffEventHandler): void {
    const idx = _handlers.indexOf(handler);
    if (idx >= 0) _handlers.splice(idx, 1);
  },
  emit(event: HandoffEvent): void {
    for (const h of _handlers) {
      try { h(event); } catch { /* ignore handler errors */ }
    }
  },
  reset(): void {
    _handlers.length = 0;
  },
};
