/**
 * AiDashboardService.ts — AI engine performance metrics.
 */

import { AIConversationSessionModel } from '../../models/AIConversationSession.model';
import { AIAnalyticsModel }           from '../../ai/analytics';
import { cached, TTL }                from '../cache/DashboardCache';

export interface AiMetrics {
  totalConversations:     number;
  avgConfidence:          number;
  intentDistribution:     Array<{ intent: string; count: number; percentage: number }>;
  stageDistribution:      Array<{ stage: string; count: number }>;
  bookingConversionRate:  number;
  guardrailActivations:   number;
  toolUsage:              Array<{ tool: string; count: number }>;
  fallbackRate:           number;
  avgTurnCount:           number;
  recommendationShown:    number;
  aiActionCount:          number;
  dailyConversations:     Array<{ date: string; count: number }>;
}

export const AiDashboardService = {

  async get(organizationId: string): Promise<AiMetrics> {
    return cached(organizationId, 'ai_dash', TTL.SHORT, async () => {
      const monthAgo = new Date(Date.now() - 30 * 86400_000);

      const [totalConv, stageAgg, confAgg, turnAgg, eventAgg, dailyAgg, guardAgg, toolAgg, recAgg] = await Promise.all([
        AIConversationSessionModel.countDocuments({ organizationId }),
        AIConversationSessionModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: '$stage', count: { $sum: 1 } } },
        ]),
        AIConversationSessionModel.aggregate([
          { $match: { organizationId, 'qualification.confidence': { $gt: 0 } } },
          { $group: { _id: null, avg: { $avg: '$qualification.confidence' } } },
        ]),
        AIConversationSessionModel.aggregate([
          { $match: { organizationId } },
          { $group: { _id: null, avg: { $avg: '$turnCount' } } },
        ]),
        AIAnalyticsModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } },
        ]),
        AIAnalyticsModel.aggregate([
          { $match: { organizationId, eventType: 'message_received', createdAt: { $gte: monthAgo } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } }, { $limit: 30 },
        ]),
        AIAnalyticsModel.countDocuments({ organizationId, eventType: 'guardrail_blocked' }),
        AIAnalyticsModel.aggregate([
          { $match: { organizationId, eventType: 'tool_called', createdAt: { $gte: monthAgo } } },
          { $group: { _id: { $getField: { field: 'tool', input: '$payload' } }, count: { $sum: 1 } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        AIAnalyticsModel.countDocuments({ organizationId, eventType: 'recommendation_shown' }),
      ]);

      const eventMap: Record<string, number> = {};
      for (const e of eventAgg) eventMap[e._id] = e.count;

      const totalMsg    = eventMap.message_received ?? 0;
      const bookings    = eventMap.booking_triggered ?? 0;
      const bookRate    = totalMsg > 0 ? Math.round((bookings / totalMsg) * 100) : 0;
      const fallbacks   = eventMap.guardrail_blocked ?? 0;
      const fallbackRate= totalMsg > 0 ? Math.round((fallbacks / totalMsg) * 100) : 0;

      // Build intent distribution from intent_classified events
      const intentAgg = await AIAnalyticsModel.aggregate([
        { $match: { organizationId, eventType: 'intent_classified', createdAt: { $gte: monthAgo } } },
        { $group: { _id: { $getField: { field: 'intent', input: '$payload' } }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      const totalIntents = intentAgg.reduce((s: number, r: any) => s + r.count, 0);

      return {
        totalConversations:    totalConv,
        avgConfidence:         Math.round(confAgg[0]?.avg ?? 0),
        intentDistribution:    intentAgg.map((r: any) => ({
          intent:     r._id ?? 'Unknown',
          count:      r.count,
          percentage: totalIntents > 0 ? Math.round((r.count / totalIntents) * 100) : 0,
        })),
        stageDistribution:     stageAgg.map((r: any) => ({ stage: r._id ?? 'greeting', count: r.count })),
        bookingConversionRate: bookRate,
        guardrailActivations:  guardAgg,
        toolUsage:             toolAgg.map((r: any) => ({ tool: r._id ?? 'unknown', count: r.count })),
        fallbackRate,
        avgTurnCount:          Math.round(turnAgg[0]?.avg ?? 0),
        recommendationShown:   recAgg,
        aiActionCount:         eventMap.tool_called ?? 0,
        dailyConversations:    dailyAgg.map((r: any) => ({ date: r._id, count: r.count })),
      };
    });
  },
};
