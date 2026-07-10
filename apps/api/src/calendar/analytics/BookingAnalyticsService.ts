/**
 * BookingAnalyticsService.ts — Scheduling analytics tracking + aggregation.
 */

import { BookingAnalyticsModel, BookingEventType } from '../../models/BookingAnalytics.model';
import { BookingModel }  from '../../models/Booking.model';
import { logger }        from '../../utils/logger';

interface TrackParams {
  organizationId:  string;
  eventType:       BookingEventType;
  bookingId?:      string;
  meetingTypeId?:  string;
  assigneeId?:     string;
  guestTimezone?:  string;
  durationMinutes?:number;
  leadTimeHours?:  number;
  metadata?:       Record<string, unknown>;
}

export interface CalendarStats {
  totalBookings:       number;
  confirmed:           number;
  cancelled:           number;
  rescheduled:         number;
  noShows:             number;
  completed:           number;
  cancellationRate:    number;   // %
  rescheduleRate:      number;   // %
  noShowRate:          number;   // %
  averageLeadTime:     number;   // hours between booking and meeting
  byMeetingType:       Array<{ meetingTypeId: string; meetingTypeName: string; count: number }>;
  byAssignee:          Array<{ assigneeId: string; count: number }>;
  utilizationByDay:    Array<{ date: string; bookings: number }>;
  averageDuration:     number;   // minutes
  bookingsThisWeek:    number;
  bookingsThisMonth:   number;
}

export const BookingAnalyticsService = {

  track(params: TrackParams): void {
    BookingAnalyticsModel.create({
      organizationId:  params.organizationId,
      eventType:       params.eventType,
      bookingId:       params.bookingId       ?? null,
      meetingTypeId:   params.meetingTypeId   ?? null,
      assigneeId:      params.assigneeId      ?? null,
      guestTimezone:   params.guestTimezone   ?? null,
      durationMinutes: params.durationMinutes ?? null,
      leadTimeHours:   params.leadTimeHours   ?? null,
      metadata:        params.metadata        ?? {},
    }).catch((err: unknown) => {
      logger.warn({ err }, '[BookingAnalytics] Failed to track event');
    });
  },

  async getStats(organizationId: string, since?: Date): Promise<CalendarStats> {
    const weekAgo  = new Date(Date.now() - 7  * 86400_000);
    const monthAgo = new Date(Date.now() - 30 * 86400_000);
    const fromDate = since ?? monthAgo;

    const [
      statusAgg,
      byTypeAgg,
      byAssigneeAgg,
      byDayAgg,
      durationAgg,
      leadTimeAgg,
      thisWeek,
      thisMonth,
    ] = await Promise.all([
      BookingModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      BookingModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: { id: '$meetingTypeId', name: '$meetingTypeName' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      BookingModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      BookingModel.aggregate([
        { $match: { organizationId, startUtc: { $gte: fromDate } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$startUtc' } },
          bookings: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      BookingModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: { _id: null, avg: { $avg: '$durationMinutes' } } },
      ]),
      BookingAnalyticsModel.aggregate([
        { $match: { organizationId, eventType: 'booking_created', createdAt: { $gte: fromDate } } },
        { $group: { _id: null, avg: { $avg: '$leadTimeHours' } } },
      ]),
      BookingModel.countDocuments({ organizationId, createdAt: { $gte: weekAgo } }),
      BookingModel.countDocuments({ organizationId, createdAt: { $gte: monthAgo } }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of statusAgg) statusMap[s._id] = s.count;

    const total       = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const confirmed   = statusMap.confirmed   ?? 0;
    const cancelled   = statusMap.cancelled   ?? 0;
    const rescheduled = statusMap.rescheduled ?? 0;
    const noShows     = statusMap.no_show     ?? 0;
    const completed   = statusMap.completed   ?? 0;

    return {
      totalBookings:    total,
      confirmed, cancelled, rescheduled, noShows, completed,
      cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
      rescheduleRate:   total > 0 ? Math.round((rescheduled / total) * 100) : 0,
      noShowRate:       total > 0 ? Math.round((noShows / total) * 100) : 0,
      averageLeadTime:  Math.round(leadTimeAgg[0]?.avg ?? 0),
      byMeetingType:    byTypeAgg.map((r: any) => ({ meetingTypeId: r._id.id, meetingTypeName: r._id.name, count: r.count })),
      byAssignee:       byAssigneeAgg.map((r: any) => ({ assigneeId: r._id, count: r.count })),
      utilizationByDay: byDayAgg.map((r: any) => ({ date: r._id, bookings: r.bookings })),
      averageDuration:  Math.round(durationAgg[0]?.avg ?? 0),
      bookingsThisWeek: thisWeek,
      bookingsThisMonth:thisMonth,
    };
  },
};
