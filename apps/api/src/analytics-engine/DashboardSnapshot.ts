/**
 * analytics-engine/DashboardSnapshot.ts
 * Generates PeriodSnapshot and DashboardSnapshot from events. PURE.
 */

import type { AnalyticsEvent, DashboardSnapshot, PeriodSnapshot } from './types';

function msAgo(ms: number, nowMs: number): string {
  return new Date(nowMs - ms).toISOString();
}

function buildSnapshot(events: readonly AnalyticsEvent[], totalConvs: number): PeriodSnapshot {
  const conversations = events.filter(e => e.type === 'conversation_started').length || totalConvs;
  const bookings      = events.filter(e => e.type === 'booking_confirmed').length;
  const handoffs      = events.filter(e => e.type === 'handoff_requested').length;
  const completions   = events.filter(e => e.type === 'conversation_completed').length;
  const abandonments  = events.filter(e => e.type === 'conversation_abandoned').length;

  const rate = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

  return {
    visitors:      conversations,
    conversations,
    bookings,
    bookingRate:   rate(bookings, conversations),
    handoffs,
    handoffRate:   rate(handoffs, conversations),
    completions,
    abandonments,
  };
}

export const DashboardSnapshotBuilder = {

  /**
   * Build a full dashboard snapshot for today / this week / this month.
   * Deterministic given the same events + nowMs.
   */
  build(params: {
    organizationId: string;
    events:         readonly AnalyticsEvent[];
    nowMs?:         number;
  }): DashboardSnapshot {
    const { organizationId, events } = params;
    const nowMs = params.nowMs ?? Date.now();

    const startOfDay   = new Date(new Date(nowMs).toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString();
    const startOfWeek  = new Date(nowMs - 7  * 86400_000).toISOString();
    const startOfMonth = new Date(nowMs - 30 * 86400_000).toISOString();
    const nowIso       = new Date(nowMs + 86400_000).toISOString(); // include events up to end of today

    const inWindow = (iso: string) =>
      events.filter(e =>
        e.organizationId === organizationId &&
        e.occurredAt >= iso &&
        e.occurredAt <= nowIso,
      );

    const todayEvents  = inWindow(startOfDay);
    const weekEvents   = inWindow(startOfWeek);
    const monthEvents  = inWindow(startOfMonth);

    return {
      organizationId,
      today:      buildSnapshot(todayEvents,  todayEvents.filter(e => e.type === 'conversation_started').length),
      thisWeek:   buildSnapshot(weekEvents,   weekEvents.filter(e => e.type === 'conversation_started').length),
      thisMonth:  buildSnapshot(monthEvents,  monthEvents.filter(e => e.type === 'conversation_started').length),
      generatedAt: new Date(nowMs).toISOString(),
    };
  },
};
