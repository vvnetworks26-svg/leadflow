/**
 * analytics-engine/EventAggregator.ts
 * Aggregates a stream of events into all metric domains. PURE.
 */

import type { AnalyticsEvent, AnalyticsReport, ReportPeriod } from './types';
import { ConversationMetricsCalculator } from './ConversationMetrics';
import { IntentMetricsCalculator }       from './IntentMetrics';
import { BookingMetricsCalculator }      from './BookingMetrics';
import { ValidationMetricsCalculator }   from './ValidationMetrics';
import { MemoryMetricsCalculator }       from './MemoryMetrics';
import { HandoffMetricsCalculator }      from './HandoffMetrics';
import { FunnelAnalyzer }               from './FunnelAnalyzer';
import { PerformanceAnalyzer }          from './PerformanceAnalyzer';

export const EventAggregator = {

  /**
   * Aggregate a slice of events into a full AnalyticsReport.
   * All calculations are deterministic given the same event list.
   */
  aggregate(params: {
    organizationId: string;
    events:         readonly AnalyticsEvent[];
    period:         ReportPeriod;
    from:           string;   // ISO date
    to:             string;   // ISO date
    totalVisitors?: number;
  }): AnalyticsReport {
    const { organizationId, events, period, from, to } = params;
    const totalVisitors = params.totalVisitors ?? events.filter(e => e.type === 'conversation_started').length;

    const conversations = ConversationMetricsCalculator.calculate(events);
    const intents       = IntentMetricsCalculator.calculate(events);
    const bookings      = BookingMetricsCalculator.calculate(events);
    const validations   = ValidationMetricsCalculator.calculate(events);
    const memory        = MemoryMetricsCalculator.calculate(events);
    const handoffs      = HandoffMetricsCalculator.calculate(events, conversations.total);
    const funnel        = FunnelAnalyzer.analyze(events, totalVisitors);
    const performance   = PerformanceAnalyzer.analyze(events);

    return {
      organizationId,
      period,
      from,
      to,
      conversations,
      intents,
      bookings,
      validations,
      memory,
      handoffs,
      funnel,
      performance,
      generatedAt: new Date().toISOString(),
    };
  },
};
