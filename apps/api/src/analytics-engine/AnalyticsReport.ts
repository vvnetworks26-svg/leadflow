/**
 * analytics-engine/AnalyticsReport.ts
 * Report factory for daily / weekly / monthly periods. PURE.
 */

import type { AnalyticsEvent, AnalyticsReport as Report, ReportPeriod } from './types';
import { EventProcessor } from './EventProcessor';
import { EventAggregator } from './EventAggregator';

const PERIOD_MS: Record<ReportPeriod, number> = {
  daily:   1 * 86400_000,
  weekly:  7 * 86400_000,
  monthly: 30 * 86400_000,
};

export const AnalyticsReportBuilder = {

  /**
   * Build a report for a given period ending at `toMs`.
   */
  build(params: {
    organizationId: string;
    events:         readonly AnalyticsEvent[];
    period:         ReportPeriod;
    toMs?:          number;
  }): Report {
    const { organizationId, period } = params;
    const toMs   = params.toMs   ?? Date.now();
    const fromMs = toMs - PERIOD_MS[period];
    const from   = new Date(fromMs).toISOString().slice(0, 10);
    const to     = new Date(toMs).toISOString().slice(0, 10);

    const slice = EventProcessor.filter(
      params.events,
      organizationId,
      new Date(fromMs).toISOString(),
      new Date(toMs + 86400_000).toISOString(),  // inclusive: add a day buffer
    );

    return EventAggregator.aggregate({ organizationId, events: slice, period, from, to });
  },

  /** Convenience: daily report */
  daily(organizationId: string, events: readonly AnalyticsEvent[], toMs?: number): Report {
    return AnalyticsReportBuilder.build({ organizationId, events, period: 'daily', toMs });
  },

  /** Convenience: weekly report */
  weekly(organizationId: string, events: readonly AnalyticsEvent[], toMs?: number): Report {
    return AnalyticsReportBuilder.build({ organizationId, events, period: 'weekly', toMs });
  },

  /** Convenience: monthly report */
  monthly(organizationId: string, events: readonly AnalyticsEvent[], toMs?: number): Report {
    return AnalyticsReportBuilder.build({ organizationId, events, period: 'monthly', toMs });
  },
};
