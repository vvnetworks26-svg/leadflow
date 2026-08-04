/**
 * analytics-engine/ValidationMetrics.ts
 * Validation failures, fallbacks, hallucination prevention. PURE.
 */

import type { AnalyticsEvent, ValidationMetrics } from './types';
import { MetricsCalculator } from './MetricsCalculator';

export const ValidationMetricsCalculator = {

  calculate(events: readonly AnalyticsEvent[]): ValidationMetrics {
    const passed               = events.filter(e => e.type === 'validation_passed').length;
    const failed               = events.filter(e => e.type === 'validation_failed').length;
    const fallbacksUsed        = events.filter(e => e.type === 'fallback_used').length;
    const hallucinationsPrevented = events.filter(e => e.type === 'hallucination_prevented').length;
    const repetitionsBlocked   = events.filter(e => e.type === 'repetition_blocked').length;
    const totalChecked         = passed + failed;

    // Group failures by validator name
    const failsByValidator: Record<string, number> = {};
    for (const e of events.filter(ev => ev.type === 'validation_failed')) {
      const validator = String(e.payload.validator ?? 'unknown');
      failsByValidator[validator] = (failsByValidator[validator] ?? 0) + 1;
    }

    return {
      totalChecked,
      passed,
      failed,
      failRate:               MetricsCalculator.pct(failed, totalChecked),
      falllbacksUsed:         fallbacksUsed,
      hallucinationsPrevented,
      repetitionsBlocked,
      failsByValidator,
    };
  },
};
