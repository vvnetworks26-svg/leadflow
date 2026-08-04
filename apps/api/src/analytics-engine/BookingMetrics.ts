/**
 * analytics-engine/BookingMetrics.ts
 * Booking funnel KPIs. PURE.
 */

import type { AnalyticsEvent, BookingMetrics } from './types';
import type { BookingValidationCode } from '../booking-engine/types';
import { MetricsCalculator } from './MetricsCalculator';

export const BookingMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[]): BookingMetrics {
    const attempts   = events.filter(e => e.type === 'booking_requested').length;
    const confirmed  = events.filter(e => e.type === 'booking_confirmed').length;
    const cancelled  = events.filter(e => e.type === 'booking_cancelled').length;
    const rescheduled= events.filter(e => e.type === 'booking_rescheduled').length;
    const failed     = events.filter(e => e.type === 'booking_failed').length;

    const failuresByReason: Partial<Record<BookingValidationCode, number>> = {};
    for (const e of events.filter(ev => ev.type === 'booking_failed')) {
      const code = e.payload.errorCode as BookingValidationCode;
      if (code) failuresByReason[code] = (failuresByReason[code] ?? 0) + 1;
    }

    // Top failure reason
    const topFailureReason = (Object.entries(failuresByReason) as [BookingValidationCode, number][])
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      attempts,
      confirmed,
      failed,
      cancelled,
      rescheduled,
      conversionRate:  MetricsCalculator.pct(confirmed, attempts),
      topFailureReason,
      failuresByReason,
    };
  },
};
