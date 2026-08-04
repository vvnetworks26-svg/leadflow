/**
 * analytics-engine/HandoffMetrics.ts
 * Human handoff rates, escalation reasons, destinations. PURE.
 */

import type { AnalyticsEvent, HandoffMetrics } from './types';
import type { EscalationReason, HandoffDestination } from '../handoff-engine/types';
import { MetricsCalculator } from './MetricsCalculator';

export const HandoffMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[], totalConversations: number): HandoffMetrics {
    const handoffEvents   = events.filter(e => e.type === 'handoff_requested');
    const total           = handoffEvents.length;
    const humanRequests   = events.filter(e => e.type === 'human_requested').length;
    const complaints      = events.filter(e => e.type === 'complaint_detected').length;
    const confidenceEscalations = events.filter(e => e.type === 'ai_confidence_low').length;

    const byReason:      Partial<Record<EscalationReason, number>> = {};
    const byDestination: Partial<Record<HandoffDestination, number>> = {};
    let   billingEscalations = 0;
    let   emergencyEscalations = 0;

    for (const e of handoffEvents) {
      const reason = e.payload.reason as EscalationReason;
      const dest   = e.payload.destination as HandoffDestination;
      if (reason) byReason[reason] = (byReason[reason] ?? 0) + 1;
      if (dest)   byDestination[dest] = (byDestination[dest] ?? 0) + 1;
      if (reason === 'billing_question' || reason === 'payment_issue') billingEscalations++;
      if (reason === 'emergency_escalation') emergencyEscalations++;
    }

    return {
      total,
      humanRequests,
      complaints,
      confidenceEscalations,
      billingEscalations,
      emergencyEscalations,
      byReason,
      byDestination,
      handoffRate: MetricsCalculator.pct(total, totalConversations),
    };
  },
};
