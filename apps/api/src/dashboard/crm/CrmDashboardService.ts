/**
 * CrmDashboardService.ts — CRM funnel, activity, and team performance metrics.
 */

import { LeadModel }    from '../../models/Lead.model';
import { TaskModel }    from '../../models/Task.model';
import { ActivityModel }from '../../models/Activity.model';
import { ContactModel } from '../../models/Contact.model';
import { cached, TTL }  from '../cache/DashboardCache';

export interface CrmMetrics {
  leadFunnel:          Array<{ stage: string; count: number; conversionFromPrev: number }>;
  leadScoreDistribution:Array<{ bucket: string; count: number }>;
  temperatureBreakdown: Array<{ temp: string; count: number }>;
  taskCompletion:       { total: number; completed: number; overdue: number; completionRate: number };
  recentActivity:       Array<{ type: string; count: number }>;
  ownerPerformance:     Array<{ ownerId: string; leads: number; qualified: number; won: number; tasks: number }>;
  duplicateLeads:       number;
  totalContacts:        number;
  newLeadsThisWeek:     number;
  newLeadsThisMonth:    number;
  avgLeadScore:         number;
  lifecycleDistribution:Array<{ stage: string; count: number }>;
}

export const CrmDashboardService = {

  async get(organizationId: string): Promise<CrmMetrics> {
    return cached(organizationId, 'crm', TTL.SHORT, async () => {
      const weekAgo  = new Date(Date.now() - 7  * 86400_000);
      const monthAgo = new Date(Date.now() - 30 * 86400_000);

      const [
        funnelAgg, scoreAgg, tempAgg, taskStats, activityAgg,
        ownerAgg, duplicates, contacts, newWeek, newMonth,
        avgScore, lifecycleAgg,
      ] = await Promise.all([
        LeadModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId } },
          { $bucket: { groupBy: '$score', boundaries: [0,20,40,60,80,101], default: 'other',
            output: { count: { $sum: 1 } } } },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$temperature', count: { $sum: 1 } } },
        ]),
        (async () => {
          const [total, completed, overdue] = await Promise.all([
            TaskModel.countDocuments({ organizationId }),
            TaskModel.countDocuments({ organizationId, completed: true }),
            TaskModel.countDocuments({ organizationId, completed: false, dueDate: { $lt: new Date() } }),
          ]);
          return { total, completed, overdue };
        })(),
        ActivityModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        LeadModel.aggregate([
          { $match: { organizationId, ownerId: { $ne: null } } },
          { $group: {
            _id:       '$ownerId',
            leads:     { $sum: 1 },
            qualified: { $sum: { $cond: [{ $in: ['$temperature',['Hot','Warm']] }, 1, 0] } },
            won:       { $sum: { $cond: [{ $eq: ['$status','Closed Won'] }, 1, 0] } },
          }},
          { $sort: { leads: -1 } }, { $limit: 10 },
        ]),
        LeadModel.countDocuments({ organizationId, duplicateOfId: { $ne: null } }),
        ContactModel.countDocuments({ organizationId }),
        LeadModel.countDocuments({ organizationId, createdAt: { $gte: weekAgo } }),
        LeadModel.countDocuments({ organizationId, createdAt: { $gte: monthAgo } }),
        LeadModel.aggregate([{ $match: { organizationId } }, { $group: { _id: null, avg: { $avg: '$score' } } }]),
        LeadModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$lifecycleStage', count: { $sum: 1 } } },
        ]),
      ]);

      const statusOrder = ['New','Contacted','Qualified','Proposal','Negotiation','Closed Won','Closed Lost','Unqualified'];
      const statusMap: Record<string, number> = {};
      for (const r of funnelAgg) statusMap[r._id] = r.count;

      const leadFunnel = statusOrder
        .filter(s => statusMap[s])
        .map((s, i, arr) => ({
          stage:              s,
          count:              statusMap[s] ?? 0,
          conversionFromPrev: i === 0 ? 100
            : statusMap[arr[i-1]] > 0 ? Math.round(((statusMap[s] ?? 0) / statusMap[arr[i-1]]) * 100) : 0,
        }));

      const taskCompletion = { ...taskStats,
        completionRate: taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0,
      };

      return {
        leadFunnel,
        leadScoreDistribution: scoreAgg.map((r: any) => ({
          bucket: r._id === 'other' ? '80+' : `${r._id}-${Number(r._id)+19}`,
          count:  r.count,
        })),
        temperatureBreakdown:  tempAgg.map((r: any) => ({ temp: r._id ?? 'Unknown', count: r.count })),
        taskCompletion,
        recentActivity:        activityAgg.map((r: any) => ({ type: r._id, count: r.count })),
        ownerPerformance:      ownerAgg.map((r: any) => ({ ownerId: r._id, leads: r.leads, qualified: r.qualified, won: r.won, tasks: 0 })),
        duplicateLeads:        duplicates,
        totalContacts:         contacts,
        newLeadsThisWeek:      newWeek,
        newLeadsThisMonth:     newMonth,
        avgLeadScore:          Math.round(avgScore[0]?.avg ?? 0),
        lifecycleDistribution: lifecycleAgg.map((r: any) => ({ stage: r._id ?? 'lead', count: r.count })),
      };
    });
  },
};
