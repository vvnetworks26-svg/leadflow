/**
 * DashboardService.ts
 *
 * Organization-scoped CRM dashboard metrics.
 * All aggregations run against the requesting organization's data only.
 */

import { LeadModel }       from '../../models/Lead.model';
import { AppointmentModel } from '../../models/Appointment.model';
import { TaskModel }        from '../../models/Task.model';
import { ActivityModel }    from '../../models/Activity.model';
import { PipelineModel }    from '../../models/Pipeline.model';

export interface DashboardMetrics {
  // Pipeline
  pipelineValue:        number;
  openOpportunities:    number;
  stageDistribution:    Array<{ stage: string; count: number; value: number }>;

  // Conversions
  conversionRate:       number;   // qualified / total leads (%)
  winRate:              number;   // won / (won + lost) (%)
  averageDealSize:      number;

  // Velocity
  averageSalesCycleDays:number;
  leadVelocity:         number;   // new leads in last 7 days

  // Revenue
  revenueClosed:        number;   // sum of Closed Won
  revenueForecast:      number;   // weighted by stage probability

  // Activity
  activitiesToday:      number;
  tasksDue:             number;   // overdue + due today

  // Leaderboard
  topOwners:            Array<{ ownerId: string; leadCount: number; value: number }>;

  // Analytics
  leadsBySource:        Array<{ source: string; count: number }>;
  leadsByStatus:        Array<{ status: string; count: number }>;
  newLeadsThisWeek:     number;
  newLeadsThisMonth:    number;
}

export const DashboardService = {

  async getMetrics(organizationId: string): Promise<DashboardMetrics> {
    const now         = new Date();
    const todayStart  = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo     = new Date(Date.now() - 7  * 86400_000);
    const monthAgo    = new Date(Date.now() - 30 * 86400_000);

    // Run all aggregations in parallel
    const [
      pipelineAgg,
      statusAgg,
      sourceAgg,
      wonAgg,
      lostAgg,
      cyclAgg,
      tasksDue,
      activitiesToday,
      topOwners,
      newThisWeek,
      newThisMonth,
      pipeline,
    ] = await Promise.all([
      // Pipeline value by stage
      LeadModel.aggregate([
        { $match: { organizationId, status: { $nin: ['Closed Won', 'Closed Lost'] } } },
        { $group: { _id: '$stageName', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } },
      ]),

      // Count by status
      LeadModel.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Count by source
      LeadModel.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),

      // Won deals
      LeadModel.aggregate([
        { $match: { organizationId, status: 'Closed Won' } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$value' } } },
      ]),

      // Lost deals
      LeadModel.aggregate([
        { $match: { organizationId, status: 'Closed Lost' } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]),

      // Average sales cycle (days from createdAt to wonDate)
      LeadModel.aggregate([
        { $match: { organizationId, status: 'Closed Won', wonDate: { $ne: null } } },
        {
          $project: {
            cycleDays: {
              $divide: [{ $subtract: ['$wonDate', '$createdAt'] }, 86400_000],
            },
          },
        },
        { $group: { _id: null, avg: { $avg: '$cycleDays' } } },
      ]),

      // Tasks overdue + due today
      TaskModel.countDocuments({
        organizationId,
        completed: false,
        dueDate: { $lte: new Date(todayStart.getTime() + 86400_000) },
      }),

      // Activities today
      ActivityModel.countDocuments({
        organizationId,
        createdAt: { $gte: todayStart },
      }),

      // Top owners by lead count
      LeadModel.aggregate([
        { $match: { organizationId, ownerId: { $ne: null } } },
        { $group: { _id: '$ownerId', leadCount: { $sum: 1 }, value: { $sum: '$estimatedValue' } } },
        { $sort: { leadCount: -1 } },
        { $limit: 5 },
      ]),

      // New leads this week
      LeadModel.countDocuments({ organizationId, createdAt: { $gte: weekAgo } }),

      // New leads this month
      LeadModel.countDocuments({ organizationId, createdAt: { $gte: monthAgo } }),

      // Default pipeline for probability-weighted forecast
      PipelineModel.findOne({ organizationId, isDefault: true }).lean(),
    ]);

    // Build stage probability map from pipeline
    const probMap: Record<string, number> = {};
    if (pipeline) {
      for (const s of (pipeline as any).stages ?? []) {
        probMap[s.name] = s.probability ?? 0;
      }
    }

    // Stage distribution
    const stageDistribution = pipelineAgg.map((row: any) => ({
      stage: row._id ?? 'Unassigned',
      count: row.count,
      value: row.value,
    }));

    // Pipeline totals
    const pipelineValue     = stageDistribution.reduce((s, r) => s + r.value, 0);
    const openOpportunities = stageDistribution.reduce((s, r) => s + r.count, 0);

    // Revenue forecast (probability-weighted)
    const revenueForecast = stageDistribution.reduce((s, r) => {
      const prob = (probMap[r.stage] ?? 50) / 100;
      return s + r.value * prob;
    }, 0);

    // Rates
    const totalLeads  = statusAgg.reduce((s: number, r: any) => s + r.count, 0);
    const wonCount    = wonAgg[0]?.count ?? 0;
    const lostCount   = lostAgg[0]?.count ?? 0;
    const qualCount   = (statusAgg.find((r: any) => r._id === 'Qualified')?.count ?? 0) +
                        (statusAgg.find((r: any) => r._id === 'Closed Won')?.count ?? 0);
    const conversionRate  = totalLeads > 0 ? Math.round((qualCount / totalLeads) * 100) : 0;
    const winRate         = (wonCount + lostCount) > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
    const revenueClosed   = wonAgg[0]?.total ?? 0;
    const averageDealSize = wonCount > 0 ? Math.round(revenueClosed / wonCount) : 0;
    const avgCycle        = Math.round(cyclAgg[0]?.avg ?? 0);

    return {
      pipelineValue:         Math.round(pipelineValue),
      openOpportunities,
      stageDistribution,
      conversionRate,
      winRate,
      averageDealSize,
      averageSalesCycleDays: avgCycle,
      leadVelocity:          newThisWeek,
      revenueClosed:         Math.round(revenueClosed),
      revenueForecast:       Math.round(revenueForecast),
      activitiesToday,
      tasksDue,
      topOwners:             topOwners.map((r: any) => ({ ownerId: r._id, leadCount: r.leadCount, value: r.value })),
      leadsBySource:         sourceAgg.map((r: any) => ({ source: r._id ?? 'unknown', count: r.count })),
      leadsByStatus:         statusAgg.map((r: any) => ({ status: r._id, count: r.count })),
      newLeadsThisWeek:      newThisWeek,
      newLeadsThisMonth:     newThisMonth,
    };
  },
};
