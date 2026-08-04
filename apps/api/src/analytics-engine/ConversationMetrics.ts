/**
 * analytics-engine/ConversationMetrics.ts
 * Computes conversation-level KPIs from events. PURE.
 */

import type { AnalyticsEvent, ConversationMetrics } from './types';
import { MetricsCalculator } from './MetricsCalculator';

export const ConversationMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[]): ConversationMetrics {
    const started   = events.filter(e => e.type === 'conversation_started').length;
    const completed = events.filter(e => e.type === 'conversation_completed').length;
    const abandoned = events.filter(e => e.type === 'conversation_abandoned').length;
    const total     = started || completed + abandoned;

    // Per-conversation turn counts
    const convTurns: Record<string, number> = {};
    for (const e of events) {
      if (e.type === 'turn_completed') {
        convTurns[e.conversationId] = (convTurns[e.conversationId] ?? 0) + 1;
      }
    }
    const turns = Object.values(convTurns);

    // Duration from start → completed/abandoned
    const startTimes: Record<string, number> = {};
    const durations: number[] = [];
    for (const e of events) {
      if (e.type === 'conversation_started') {
        startTimes[e.conversationId] = new Date(e.occurredAt).getTime();
      } else if ((e.type === 'conversation_completed' || e.type === 'conversation_abandoned')) {
        const st = startTimes[e.conversationId];
        if (st) durations.push(new Date(e.occurredAt).getTime() - st);
      }
    }

    const sortedDurations = [...durations].sort((a, b) => a - b);

    return {
      total,
      completed,
      abandoned,
      completionRate:  MetricsCalculator.pct(completed, total),
      abandonmentRate: MetricsCalculator.pct(abandoned, total),
      avgTurns:        MetricsCalculator.avg(turns),
      avgDurationMs:   MetricsCalculator.avg(durations),
      p50DurationMs:   MetricsCalculator.percentile(sortedDurations, 50),
      p95DurationMs:   MetricsCalculator.percentile(sortedDurations, 95),
    };
  },
};
