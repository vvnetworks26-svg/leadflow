/**
 * BookingDashboardService.ts — Scheduling and meeting metrics.
 */

import { BookingModel }    from '../../models/Booking.model';
import { MeetingTypeModel }from '../../models/MeetingType.model';
import { cached, TTL }     from '../cache/DashboardCache';

export interface BookingMetrics {
  upcomingMeetings:     number;
  todaySchedule:        Array<{ id: string; guestName: string; meetingType: string; startUtc: Date; assigneeId: string }>;
  reschedules:          number;
  noShows:              number;
  cancellations:        number;
  cancellationRate:     number;
  utilizationPercent:   number;
  teamLoad:             Array<{ assigneeId: string; upcoming: number; completed: number }>;
  meetingTypeBreakdown: Array<{ meetingTypeName: string; count: number; percentage: number }>;
  weeklyTrend:          Array<{ date: string; booked: number; completed: number; cancelled: number }>;
  avgLeadTimeHours:     number;
}

export const BookingDashboardService = {

  async get(organizationId: string): Promise<BookingMetrics> {
    return cached(organizationId, 'bookings_dash', TTL.REALTIME, async () => {
      const now        = new Date();
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const todayEnd   = new Date(todayStart.getTime() + 86400_000);
      const weekAgo    = new Date(now.getTime() - 7  * 86400_000);
      const monthAgo   = new Date(now.getTime() - 30 * 86400_000);

      const [upcoming, todaySchedule, reschedules, noShows, cancellations, teamAgg, typeAgg, weeklyAgg, totalAgg, leadTimeAgg] = await Promise.all([
        BookingModel.countDocuments({ organizationId, status: { $in: ['confirmed','rescheduled'] }, startUtc: { $gte: now } }),
        BookingModel.find({ organizationId, status: { $in: ['confirmed','rescheduled'] }, startUtc: { $gte: todayStart, $lt: todayEnd } })
          .select('guestName meetingTypeName startUtc assigneeId').sort({ startUtc: 1 }).limit(20).lean(),
        BookingModel.countDocuments({ organizationId, status: 'rescheduled', createdAt: { $gte: monthAgo } }),
        BookingModel.countDocuments({ organizationId, status: 'no_show', createdAt: { $gte: monthAgo } }),
        BookingModel.countDocuments({ organizationId, status: 'cancelled', createdAt: { $gte: monthAgo } }),
        BookingModel.aggregate([
          { $match: { organizationId } },
          { $group: {
            _id:       '$assigneeId',
            upcoming:  { $sum: { $cond: [{ $and: [{ $in: ['$status',['confirmed','rescheduled']] }, { $gte: ['$startUtc', now] }] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
          }},
          { $sort: { upcoming: -1 } }, { $limit: 10 },
        ]),
        BookingModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$meetingTypeName', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        BookingModel.aggregate([
          { $match: { organizationId, startUtc: { $gte: weekAgo } } },
          { $group: {
            _id:       { $dateToString: { format: '%Y-%m-%d', date: '$startUtc' } },
            booked:    { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status','cancelled'] }, 1, 0] } },
          }},
          { $sort: { _id: 1 } },
        ]),
        BookingModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: null, total: { $sum: 1 } } },
        ]),
        BookingModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $project: { leadTimeHours: { $divide: [{ $subtract: ['$startUtc', '$createdAt'] }, 3600_000] } } },
          { $group: { _id: null, avg: { $avg: '$leadTimeHours' } } },
        ]),
      ]);

      const total       = totalAgg[0]?.total ?? 0;
      const cancelRate  = total > 0 ? Math.round((cancellations / total) * 100) : 0;
      const totalTypes  = typeAgg.reduce((s: number, r: any) => s + r.count, 0);

      return {
        upcomingMeetings:     upcoming,
        todaySchedule:        todaySchedule.map((b: any) => ({
          id: b._id.toString(), guestName: b.guestName,
          meetingType: b.meetingTypeName, startUtc: b.startUtc, assigneeId: b.assigneeId,
        })),
        reschedules, noShows, cancellations,
        cancellationRate:     cancelRate,
        utilizationPercent:   0,   // would need working hours calc
        teamLoad:             teamAgg.map((r: any) => ({ assigneeId: r._id, upcoming: r.upcoming, completed: r.completed })),
        meetingTypeBreakdown: typeAgg.map((r: any) => ({
          meetingTypeName: r._id ?? 'Unknown', count: r.count,
          percentage:      totalTypes > 0 ? Math.round((r.count / totalTypes) * 100) : 0,
        })),
        weeklyTrend:          weeklyAgg.map((r: any) => ({ date: r._id, booked: r.booked, completed: r.completed, cancelled: r.cancelled })),
        avgLeadTimeHours:     Math.round(leadTimeAgg[0]?.avg ?? 0),
      };
    });
  },
};
