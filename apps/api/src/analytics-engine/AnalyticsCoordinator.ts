/**
 * analytics-engine/AnalyticsCoordinator.ts
 * In-memory event store + coordinator. PURE aggregation, no DB.
 */

import type { AnalyticsEvent, DashboardSnapshot, AnalyticsReport as Report, ReportPeriod } from './types';
import { EventProcessor }        from './EventProcessor';
import { DashboardSnapshotBuilder } from './DashboardSnapshot';
import { AnalyticsReportBuilder } from './AnalyticsReport';

// ─── In-memory store ──────────────────────────────────────────────────────────

const _stores: Map<string, AnalyticsEvent[]> = new Map();

function store(orgId: string): AnalyticsEvent[] {
  if (!_stores.has(orgId)) _stores.set(orgId, []);
  return _stores.get(orgId)!;
}

// ─── Coordinator ──────────────────────────────────────────────────────────────

export const AnalyticsCoordinator = {

  /** Ingest a single event. Silently drops invalid events. */
  ingest(raw: Partial<AnalyticsEvent>): boolean {
    const result = EventProcessor.process(raw);
    if (!result.valid || !result.event) return false;
    store(result.event.organizationId).push(result.event);
    return true;
  },

  /** Ingest a batch. Returns count of accepted events. */
  ingestBatch(raws: Partial<AnalyticsEvent>[]): number {
    const valid = EventProcessor.processBatch(raws);
    for (const e of valid) store(e.organizationId).push(e);
    return valid.length;
  },

  /** Get all events for an org. */
  getEvents(organizationId: string): readonly AnalyticsEvent[] {
    return store(organizationId);
  },

  /** Generate a dashboard snapshot. */
  dashboard(organizationId: string, nowMs?: number): DashboardSnapshot {
    return DashboardSnapshotBuilder.build({
      organizationId,
      events: store(organizationId),
      nowMs,
    });
  },

  /** Generate a report. */
  report(organizationId: string, period: ReportPeriod, toMs?: number): Report {
    return AnalyticsReportBuilder.build({
      organizationId,
      events: store(organizationId),
      period,
      toMs,
    });
  },

  /** Clear all events for an org (for test isolation). */
  reset(organizationId?: string): void {
    if (organizationId) {
      _stores.delete(organizationId);
    } else {
      _stores.clear();
    }
  },

  /** Total event count for an org. */
  count(organizationId: string): number {
    return store(organizationId).length;
  },
};
