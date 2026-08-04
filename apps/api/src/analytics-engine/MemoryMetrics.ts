/**
 * analytics-engine/MemoryMetrics.ts
 * Memory completeness, field coverage, confidence. PURE.
 */

import type { AnalyticsEvent, MemoryMetrics } from './types';
import { MetricsCalculator } from './MetricsCalculator';

const TRACKED_FIELDS = [
  'visitorName', 'phone', 'email', 'address', 'service',
  'preferredTime', 'company', 'budget', 'timeline',
];

export const MemoryMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[]): MemoryMetrics {
    const fieldCounts:      Record<string, number> = {};
    const convFieldCounts:  Record<string, Set<string>> = {};
    const lowConfidenceCount = { total: 0, low: 0 };

    for (const e of events) {
      if (e.type === 'field_collected') {
        const field = String(e.payload.field ?? '');
        if (field) {
          fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
          if (!convFieldCounts[e.conversationId]) {
            convFieldCounts[e.conversationId] = new Set();
          }
          convFieldCounts[e.conversationId].add(field);
        }
        const confidence = Number(e.payload.confidence ?? 100);
        lowConfidenceCount.total++;
        if (confidence < 50) lowConfidenceCount.low++;
      }
    }

    // Average fields collected per conversation
    const fieldCountsPerConv = Object.values(convFieldCounts).map(s => s.size);
    const avgFields = MetricsCalculator.avg(fieldCountsPerConv);

    // Completion rate: conversations with all key fields
    const conversations = Object.keys(convFieldCounts).length;
    const complete = Object.values(convFieldCounts).filter(s =>
      ['visitorName', 'phone', 'service'].every(f => s.has(f))
    ).length;
    const completionRate = MetricsCalculator.pct(complete, conversations);

    // Field coverage: % of conversations that collected each field
    const fieldCoverage: Record<string, number> = {};
    for (const field of TRACKED_FIELDS) {
      const count = Object.values(convFieldCounts).filter(s => s.has(field)).length;
      fieldCoverage[field] = MetricsCalculator.pct(count, conversations);
    }

    const lowConfidenceRate = MetricsCalculator.pct(
      lowConfidenceCount.low,
      lowConfidenceCount.total,
    );

    return {
      avgFieldsCollected: avgFields,
      completionRate,
      fieldCoverage,
      lowConfidenceRate,
    };
  },
};
