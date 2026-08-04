/**
 * analytics-engine/FunnelAnalyzer.ts
 * Measures stage-by-stage conversion through the conversation funnel. PURE.
 */

import type { AnalyticsEvent, FunnelMetrics, FunnelStage } from './types';
import type { ConversationStage } from '../ai/types';
import { MetricsCalculator } from './MetricsCalculator';

const FUNNEL_ORDER: Array<ConversationStage | 'visitor'> = [
  'visitor', 'greeting', 'discovery', 'qualification',
  'recommendation', 'booking', 'completed',
];

export const FunnelAnalyzer = {

  analyze(events: readonly AnalyticsEvent[], totalVisitors: number): FunnelMetrics {
    // Count how many conversations entered each stage
    const stageCounts: Partial<Record<ConversationStage | 'visitor', number>> = {
      visitor: totalVisitors,
    };
    const stageEntryTimes: Record<string, Record<ConversationStage, number>> = {};
    const stageDurations:  Record<ConversationStage | 'visitor', number[]> = {} as any;

    for (const e of events) {
      if (e.type === 'conversation_started') {
        stageCounts['greeting'] = (stageCounts['greeting'] ?? 0) + 1;
      }
      if (e.type === 'conversation_completed') {
        stageCounts['completed'] = (stageCounts['completed'] ?? 0) + 1;
      }
      if (e.type === 'stage_transition') {
        const to   = e.payload.to   as ConversationStage;
        const from = e.payload.from as ConversationStage;
        if (to)   stageCounts[to]   = (stageCounts[to]   ?? 0) + 1;

        // Track time spent in each stage
        if (!stageEntryTimes[e.conversationId]) {
          stageEntryTimes[e.conversationId] = {} as any;
        }
        const now = new Date(e.occurredAt).getTime();
        const enteredAt = stageEntryTimes[e.conversationId][from];
        if (enteredAt) {
          if (!stageDurations[from]) stageDurations[from] = [];
          stageDurations[from].push(now - enteredAt);
        }
        stageEntryTimes[e.conversationId][to] = now;
      }
    }

    // Build funnel stages
    const stages: FunnelStage[] = [];
    let   biggestDropoff: ConversationStage | 'visitor' | null = null;
    let   biggestDropoffRate = 0;

    for (let i = 0; i < FUNNEL_ORDER.length; i++) {
      const stage = FUNNEL_ORDER[i]!;
      const next  = FUNNEL_ORDER[i + 1];
      const entered   = stageCounts[stage] ?? 0;
      const converted = next ? (stageCounts[next] ?? 0) : 0;
      const abandoned = Math.max(0, entered - converted);
      const abandonRate = MetricsCalculator.pct(abandoned, entered);

      if (abandonRate > biggestDropoffRate && entered > 0) {
        biggestDropoffRate = abandonRate;
        biggestDropoff     = stage;
      }

      stages.push({
        stage,
        entered,
        exited:         entered,
        converted,
        abandoned,
        conversionRate: MetricsCalculator.pct(converted, entered),
        abandonRate,
        avgTimeMs:      MetricsCalculator.avg(stageDurations[stage as ConversationStage] ?? []),
      });
    }

    const visitors  = stageCounts['visitor'] ?? totalVisitors;
    const completed = stageCounts['completed'] ?? 0;

    return {
      stages,
      overallRate:     MetricsCalculator.pct(completed, visitors),
      biggestDropoff,
    };
  },
};
