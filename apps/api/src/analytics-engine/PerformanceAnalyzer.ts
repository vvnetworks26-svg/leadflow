/**
 * analytics-engine/PerformanceAnalyzer.ts
 * Latency p50/p95 per component. PURE.
 */

import type { AnalyticsEvent, PerformanceMetrics, LatencyBucket } from './types';
import { MetricsCalculator } from './MetricsCalculator';

const LATENCY_LABELS: Record<string, string> = {
  response_generated: 'Response Generation',
  booking_confirmed:  'Booking Engine',
  validation_passed:  'Validation Engine',
  validation_failed:  'Validation Engine',
  handoff_requested:  'Handoff Engine',
};

export const PerformanceAnalyzer = {

  analyze(events: readonly AnalyticsEvent[]): PerformanceMetrics {
    const bucketData: Record<string, number[]> = {};
    const allLatencies: number[] = [];

    for (const e of events) {
      const ms = Number(e.payload.durationMs ?? e.payload.latencyMs ?? 0);
      if (ms <= 0) continue;

      const label = LATENCY_LABELS[e.type] ?? e.type;
      if (!bucketData[label]) bucketData[label] = [];
      bucketData[label].push(ms);
      allLatencies.push(ms);
    }

    const buckets: LatencyBucket[] = Object.entries(bucketData).map(([label, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        label,
        p50Ms:   MetricsCalculator.percentile(sorted, 50),
        p95Ms:   MetricsCalculator.percentile(sorted, 95),
        avgMs:   MetricsCalculator.avg(values),
        samples: values.length,
      };
    });

    const allSorted = [...allLatencies].sort((a, b) => a - b);
    const overall: LatencyBucket = {
      label:   'Overall',
      p50Ms:   MetricsCalculator.percentile(allSorted, 50),
      p95Ms:   MetricsCalculator.percentile(allSorted, 95),
      avgMs:   MetricsCalculator.avg(allLatencies),
      samples: allLatencies.length,
    };

    return { buckets, overall };
  },
};
