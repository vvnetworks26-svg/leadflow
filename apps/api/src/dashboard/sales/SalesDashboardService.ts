/**
 * SalesDashboardService.ts — Sales pipeline metrics.
 */

import { LeadModel }   from '../../models/Lead.model';
import { PipelineModel } from '../../models/Pipeline.model';
import { cached, TTL } from '../cache/DashboardCache';

export interface SalesMetrics {
  pipelineValue:        number;
  dealsWon:             number;
  dealsLost:            number;
  dealsWonValue:        number;
  forecast:             number;
  stageDistribution:    Array<{ stage: string; count: number; value: number; probability: number }>;
  avgDealSize:          number;
  salesVelocityDays:    number;
  winRate:              number;
  leadSources:          Array<{ source: string; count: number; value: number }>;
  topIndustries:        Array<{ industry: string; count: number; value: number }>;
  monthlyTrend:         Array<{ month: string; won: number; lost: number; value: number }>;
  ownerLeaderboard:     Array<{ ownerId: string; won: number; value: number; pipeline: number }>;
}

export const SalesDashboardService = {

  async get(organizationId: string, since?: Date): Promise<SalesMetrics> {
    const fromDate = since ?? new Date(Date.now() - 30 * 86400_000);
    return cached(organizationId, `sales:${fromDate.toISOString().slice(0,10)}`, TTL.SHORT, async () => {

      const [stageAgg, sourceAgg, industryAgg, monthlyAgg, wonAgg, lostAgg, cycleAgg, pipeAgg, ownerAgg] = await Promise.all([
        // Stage distribution
        LeadModel.aggregate([
          { $match: { organizationId, status: { $nin: ['Closed Won','Closed Lost'] } } },
          { $group: { _id: '$stageName', count: { $sum: 1 }, value: { $sum: '$estimatedValue' } } },
        ]),
        // Lead sources
        LeadModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: fromDate } } },
          { $group: { _id: '$source', count: { $sum: 1 }, value: { $sum: '$value' } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        // Industries
        LeadModel.aggregate([
          { $match: { organizationId, company: { $exists: true, $ne: '' } } },
          { $group: { _id: '$hvacNeed', count: { $sum: 1 }, value: { $sum: '$value' } } },
          { $sort: { count: -1 } }, { $limit: 8 },
        ]),
        // Monthly won/lost trend
        LeadModel.aggregate([
          { $match: { organizationId, status: { $in: ['Closed Won','Closed Lost'] }, updatedAt: { $gte: new Date(Date.now() - 180 * 86400_000) } } },
          { $group: {
            _id:   { month: { $dateToString: { format: '%Y-%m', date: '$updatedAt' } }, status: '$status' },
            count: { $sum: 1 }, value: { $sum: '$value' },
          }},
          { $sort: { '_id.month': 1 } },
        ]),
        // Won stats
        LeadModel.aggregate([{ $match: { organizationId, status: 'Closed Won', createdAt: { $gte: fromDate } } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$value' } } }]),
        // Lost stats
        LeadModel.aggregate([{ $match: { organizationId, status: 'Closed Lost', createdAt: { $gte: fromDate } } }, { $group: { _id: null, count: { $sum: 1 } } }]),
        // Sales cycle days
        LeadModel.aggregate([
          { $match: { organizationId, status: 'Closed Won', wonDate: { $ne: null } } },
          { $project: { days: { $divide: [{ $subtract: ['$wonDate', '$createdAt'] }, 86400_000] } } },
          { $group: { _id: null, avg: { $avg: '$days' } } },
        ]),
        // Open pipeline
        LeadModel.aggregate([{ $match: { organizationId, status: { $nin: ['Closed Won','Closed Lost'] } } }, { $group: { _id: null, total: { $sum: '$estimatedValue' } } }]),
        // Owner leaderboard
        LeadModel.aggregate([
          { $match: { organizationId, ownerId: { $ne: null } } },
          { $group: {
            _id:       '$ownerId',
            won:       { $sum: { $cond: [{ $eq: ['$status','Closed Won'] }, 1, 0] } },
            value:     { $sum: { $cond: [{ $eq: ['$status','Closed Won'] }, '$value', 0] } },
            pipeline:  { $sum: { $cond: [{ $in: ['$status',['Closed Won','Closed Lost']] }, 0, '$estimatedValue'] } },
          }},
          { $sort: { value: -1 } }, { $limit: 10 },
        ]),
      ]);

      // Build stage probability map from pipeline
      const pipeline = await PipelineModel.findOne({ organizationId, isDefault: true }).lean();
      const probMap: Record<string, number> = {};
      for (const s of (pipeline as any)?.stages ?? []) probMap[s.name] = s.probability ?? 0;

      const stageDistribution = stageAgg.map((r: any) => ({
        stage: r._id ?? 'Unassigned', count: r.count, value: r.value,
        probability: probMap[r._id] ?? 50,
      }));

      const forecast = stageDistribution.reduce((s, r) => s + r.value * (r.probability / 100), 0);
      const pipelineValue = pipeAgg[0]?.total ?? 0;
      const dealsWon      = wonAgg[0]?.count ?? 0;
      const dealsLost     = lostAgg[0]?.count ?? 0;
      const dealsWonValue = wonAgg[0]?.total ?? 0;
      const avgDealSize   = dealsWon > 0 ? Math.round(dealsWonValue / dealsWon) : 0;
      const winRate       = (dealsWon + dealsLost) > 0 ? Math.round((dealsWon / (dealsWon + dealsLost)) * 100) : 0;

      // Build monthly trend map
      const monthMap: Record<string, { won: number; lost: number; value: number }> = {};
      for (const r of monthlyAgg) {
        const m = r._id.month;
        if (!monthMap[m]) monthMap[m] = { won: 0, lost: 0, value: 0 };
        if (r._id.status === 'Closed Won')  { monthMap[m].won   += r.count; monthMap[m].value += r.value; }
        if (r._id.status === 'Closed Lost') monthMap[m].lost += r.count;
      }
      const monthlyTrend = Object.entries(monthMap).map(([month, v]) => ({ month, ...v }));

      return {
        pipelineValue: Math.round(pipelineValue),
        dealsWon, dealsLost,
        dealsWonValue:     Math.round(dealsWonValue),
        forecast:          Math.round(forecast),
        stageDistribution,
        avgDealSize,
        salesVelocityDays: Math.round(cycleAgg[0]?.avg ?? 0),
        winRate,
        leadSources:       sourceAgg.map((r: any) => ({ source: r._id ?? 'direct', count: r.count, value: r.value })),
        topIndustries:     industryAgg.map((r: any) => ({ industry: r._id ?? 'Unknown', count: r.count, value: r.value })),
        monthlyTrend,
        ownerLeaderboard:  ownerAgg.map((r: any) => ({ ownerId: r._id, won: r.won, value: r.value, pipeline: r.pipeline })),
      };
    });
  },
};
