/**
 * OverviewService.ts — Executive dashboard overview cards.
 * All 12 KPI cards computed in one parallel pass.
 */

import { LeadModel }              from '../../models/Lead.model';
import { AppointmentModel }       from '../../models/Appointment.model';
import { ConversationModel }      from '../../models/Conversation.model';
import { TaskModel }              from '../../models/Task.model';
import { BookingModel }           from '../../models/Booking.model';
import { WorkflowExecutionModel } from '../../models/WorkflowExecution.model';
import { AIConversationSessionModel } from '../../models/AIConversationSession.model';
import { cached, TTL }            from '../cache/DashboardCache';

export interface OverviewMetrics {
  todaysLeads:          number;
  activeConversations:  number;
  qualifiedLeads:       number;
  bookingsToday:        number;
  revenue:              number;
  pipelineValue:        number;
  tasksDue:             number;
  openOpportunities:    number;
  conversionRate:       number;
  avgResponseTimeSec:   number;
  aiConfidence:         number;
  automationSuccess:    number;
  // Trends (vs yesterday)
  trends: {
    leads:     number;
    bookings:  number;
    revenue:   number;
    pipeline:  number;
  };
  generatedAt: string;
}

export const OverviewService = {

  async get(organizationId: string): Promise<OverviewMetrics> {
    return cached(organizationId, 'overview', TTL.REALTIME, async () => {
      const now        = new Date();
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const yestStart  = new Date(todayStart.getTime() - 86400_000);
      const weekAgo    = new Date(now.getTime() - 7 * 86400_000);
      const monthAgo   = new Date(now.getTime() - 30 * 86400_000);

      const [
        todaysLeads, yesterdaysLeads,
        activeConversations, qualifiedLeads,
        bookingsToday, bookingsYest,
        revenueAgg, pipelineAgg,
        tasksDue, openOpps,
        totalLeads, closedWon,
        workflowStats, aiSessions,
      ] = await Promise.all([
        LeadModel.countDocuments({ organizationId, createdAt: { $gte: todayStart } }),
        LeadModel.countDocuments({ organizationId, createdAt: { $gte: yestStart, $lt: todayStart } }),
        ConversationModel.countDocuments({ organizationId, status: 'active' }),
        LeadModel.countDocuments({ organizationId, temperature: { $in: ['Hot','Warm'] } }),
        BookingModel.countDocuments({ organizationId, startUtc: { $gte: todayStart }, status: { $in: ['confirmed','rescheduled'] } }),
        BookingModel.countDocuments({ organizationId, startUtc: { $gte: yestStart, $lt: todayStart }, status: { $in: ['confirmed','rescheduled'] } }),
        LeadModel.aggregate([{ $match: { organizationId, status: 'Closed Won' } }, { $group: { _id: null, total: { $sum: '$value' } } }]),
        LeadModel.aggregate([{ $match: { organizationId, status: { $nin: ['Closed Won','Closed Lost'] } } }, { $group: { _id: null, total: { $sum: '$estimatedValue' } } }]),
        TaskModel.countDocuments({ organizationId, completed: false, dueDate: { $lt: now } }),
        LeadModel.countDocuments({ organizationId, status: { $nin: ['Closed Won','Closed Lost','Unqualified'] } }),
        LeadModel.countDocuments({ organizationId, createdAt: { $gte: monthAgo } }),
        LeadModel.countDocuments({ organizationId, status: 'Closed Won', createdAt: { $gte: monthAgo } }),
        WorkflowExecutionModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: weekAgo } } },
          { $group: { _id: null, total: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } } } },
        ]),
        AIConversationSessionModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: null, avgScore: { $avg: '$qualification.confidence' } } },
        ]),
      ]);

      const revenue    = revenueAgg[0]?.total  ?? 0;
      const pipeline   = pipelineAgg[0]?.total ?? 0;
      const wf         = workflowStats[0] ?? { total: 0, success: 0 };
      const aiConf     = aiSessions[0]?.avgScore ?? 0;
      const convRate   = totalLeads > 0 ? Math.round((closedWon / totalLeads) * 100) : 0;
      const autoSucc   = wf.total > 0 ? Math.round((wf.success / wf.total) * 100) : 0;

      return {
        todaysLeads, activeConversations, qualifiedLeads,
        bookingsToday, revenue: Math.round(revenue), pipelineValue: Math.round(pipeline),
        tasksDue, openOpportunities: openOpps,
        conversionRate:    convRate,
        avgResponseTimeSec:0,   // placeholder — needs message timestamp delta
        aiConfidence:      Math.round(aiConf),
        automationSuccess: autoSucc,
        trends: {
          leads:    todaysLeads   - yesterdaysLeads,
          bookings: bookingsToday - bookingsYest,
          revenue:  0,   // would need yesterday's revenue
          pipeline: 0,
        },
        generatedAt: new Date().toISOString(),
      };
    });
  },
};
