/**
 * analytics-engine/AnalyticsEngine.ts
 *
 * Layer 10 — Public entry point.
 * Observes all previous layers. Never changes conversation behaviour.
 * Read-only. Deterministic. No LLM. No network.
 */

import type { AnalyticsEvent, DashboardSnapshot, AnalyticsReport, ReportPeriod } from './types';
import { AnalyticsCoordinator } from './AnalyticsCoordinator';
import { EventProcessor }       from './EventProcessor';

export const AnalyticsEngine = {

  /** Record an event from any layer. */
  track(event: Partial<AnalyticsEvent>): boolean {
    return AnalyticsCoordinator.ingest(event);
  },

  /** Record a batch of events. Returns count accepted. */
  trackBatch(events: Partial<AnalyticsEvent>[]): number {
    return AnalyticsCoordinator.ingestBatch(events);
  },

  /** Generate a dashboard snapshot for an organisation. */
  dashboard(organizationId: string, nowMs?: number): DashboardSnapshot {
    return AnalyticsCoordinator.dashboard(organizationId, nowMs);
  },

  /** Generate a structured report. */
  report(organizationId: string, period: ReportPeriod, toMs?: number): AnalyticsReport {
    return AnalyticsCoordinator.report(organizationId, period, toMs);
  },

  /** Daily report shorthand. */
  daily(organizationId: string, toMs?: number): AnalyticsReport {
    return AnalyticsCoordinator.report(organizationId, 'daily', toMs);
  },

  /** Weekly report shorthand. */
  weekly(organizationId: string, toMs?: number): AnalyticsReport {
    return AnalyticsCoordinator.report(organizationId, 'weekly', toMs);
  },

  /** Monthly report shorthand. */
  monthly(organizationId: string, toMs?: number): AnalyticsReport {
    return AnalyticsCoordinator.report(organizationId, 'monthly', toMs);
  },

  /** Get raw event count for an org. */
  count(organizationId: string): number {
    return AnalyticsCoordinator.count(organizationId);
  },

  /** Reset all analytics for an org (test isolation). */
  reset(organizationId?: string): void {
    AnalyticsCoordinator.reset(organizationId);
  },

  /** Validate an event without ingesting. */
  validate(event: Partial<AnalyticsEvent>): { valid: boolean; reason?: string } {
    const r = EventProcessor.process(event);
    return { valid: r.valid, reason: r.reason };
  },
};
