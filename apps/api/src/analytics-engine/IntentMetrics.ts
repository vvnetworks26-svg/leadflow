/**
 * analytics-engine/IntentMetrics.ts
 * Intent frequency, conversion, abandonment. PURE.
 */

import type { AnalyticsEvent, IntentMetrics, IntentMetricEntry } from './types';
import type { IntentCategory } from '../intent-engine/types';
import { MetricsCalculator } from './MetricsCalculator';

export const IntentMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[]): IntentMetrics {
    // Count intents
    const counts:      Partial<Record<string, number>> = {};
    const conversions: Partial<Record<string, number>> = {};
    const abandonments:Partial<Record<string, number>> = {};
    // Map conversationId → intent
    const convIntent:  Record<string, string> = {};

    for (const e of events) {
      if (e.type === 'intent_detected') {
        const intent = String(e.payload.intent ?? 'unknown');
        counts[intent] = (counts[intent] ?? 0) + 1;
        convIntent[e.conversationId] = intent;
      }
    }

    // A conversion = booking_confirmed after intent_detected in same conversation
    const confirmedConvIds = new Set(
      events.filter(e => e.type === 'booking_confirmed').map(e => e.conversationId),
    );
    const abandonedConvIds = new Set(
      events.filter(e => e.type === 'conversation_abandoned').map(e => e.conversationId),
    );

    for (const [convId, intent] of Object.entries(convIntent)) {
      if (confirmedConvIds.has(convId)) {
        conversions[intent] = (conversions[intent] ?? 0) + 1;
      }
      if (abandonedConvIds.has(convId)) {
        abandonments[intent] = (abandonments[intent] ?? 0) + 1;
      }
    }

    const totalDetected = MetricsCalculator.sumMap(counts);

    const byIntent: IntentMetricEntry[] = (Object.entries(counts) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => ({
        intent:         intent as IntentCategory,
        count,
        conversions:    conversions[intent] ?? 0,
        abandonments:   abandonments[intent] ?? 0,
        conversionRate: MetricsCalculator.pct(conversions[intent] ?? 0, count),
      }));

    const topIntent = byIntent[0]?.intent ?? null;

    return { byIntent, topIntent, totalDetected };
  },
};
