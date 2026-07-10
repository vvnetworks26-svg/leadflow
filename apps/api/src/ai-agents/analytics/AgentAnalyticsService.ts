/**
 * AgentAnalyticsService.ts — Agent usage tracking and aggregated stats.
 */

import { AgentAnalyticsModel, AgentEventType } from '../../models/AgentAnalytics.model';
import { AgentSessionModel }                   from '../../models/AgentSession.model';
import { logger }                              from '../../utils/logger';

interface TrackParams {
  organizationId: string;
  agentId:        string;
  sessionId:      string;
  eventType:      AgentEventType;
  toolName?:      string;
  latencyMs?:     number;
  tokenCount?:    number;
  confidence?:    number;
  metadata?:      Record<string, unknown>;
}

export interface AgentStats {
  totalSessions:    number;
  completedSessions:number;
  failedSessions:   number;
  successRate:      number;
  averageLatencyMs: number;
  totalTokens:      number;
  totalToolCalls:   number;
  toolUsage:        Array<{ toolName: string; count: number; successRate: number }>;
  averageConfidence:number;
  memoryHitRate:    number;
  knowledgeHitRate: number;
  safetyBlocks:     number;
  sessionsByDay:    Array<{ date: string; count: number }>;
}

export const AgentAnalyticsService = {

  track(params: TrackParams): void {
    AgentAnalyticsModel.create({
      organizationId: params.organizationId,
      agentId:        params.agentId,
      sessionId:      params.sessionId,
      eventType:      params.eventType,
      toolName:       params.toolName    ?? null,
      latencyMs:      params.latencyMs   ?? null,
      tokenCount:     params.tokenCount  ?? null,
      confidence:     params.confidence  ?? null,
      metadata:       params.metadata    ?? {},
    }).catch((err: unknown) => logger.warn({ err }, '[AgentAnalytics] track failed'));
  },

  async getStats(organizationId: string, agentId?: string, since?: Date): Promise<AgentStats> {
    const fromDate = since ?? new Date(Date.now() - 30 * 86400_000);
    const match: Record<string, unknown> = { organizationId, createdAt: { $gte: fromDate } };
    if (agentId) match.agentId = agentId;

    const [eventAgg, toolAgg, latencyAgg, confAgg, dailyAgg, sessionStats] = await Promise.all([
      AgentAnalyticsModel.aggregate([{ $match: match }, { $group: { _id: '$eventType', count: { $sum: 1 } } }]),
      AgentAnalyticsModel.aggregate([
        { $match: { ...match, toolName: { $ne: null } } },
        { $group: {
          _id:         '$toolName',
          total:       { $sum: 1 },
          successes:   { $sum: { $cond: [{ $eq: ['$eventType','tool_succeeded'] }, 1, 0] } },
        }},
        { $sort: { total: -1 } }, { $limit: 10 },
      ]),
      AgentAnalyticsModel.aggregate([
        { $match: { ...match, latencyMs: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$latencyMs' }, total: { $sum: '$tokenCount' } } },
      ]),
      AgentAnalyticsModel.aggregate([
        { $match: { ...match, confidence: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$confidence' } } },
      ]),
      AgentAnalyticsModel.aggregate([
        { $match: { ...match, eventType: 'session_started' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }, { $limit: 30 },
      ]),
      (async () => {
        const sessionFilter: Record<string, unknown> = { organizationId, createdAt: { $gte: fromDate } };
        if (agentId) sessionFilter.agentId = agentId;
        const [total, completed, failed] = await Promise.all([
          AgentSessionModel.countDocuments(sessionFilter),
          AgentSessionModel.countDocuments({ ...sessionFilter, status: 'completed' }),
          AgentSessionModel.countDocuments({ ...sessionFilter, status: { $in: ['failed','timeout'] } }),
        ]);
        return { total, completed, failed };
      })(),
    ]);

    const em: Record<string, number> = {};
    for (const e of eventAgg) em[e._id] = e.count;

    const total     = sessionStats.total;
    const completed = sessionStats.completed;
    const failed    = sessionStats.failed;

    return {
      totalSessions:     total,
      completedSessions: completed,
      failedSessions:    failed,
      successRate:       total > 0 ? Math.round((completed / total) * 100) : 0,
      averageLatencyMs:  Math.round(latencyAgg[0]?.avg ?? 0),
      totalTokens:       latencyAgg[0]?.total ?? 0,
      totalToolCalls:    (em.tool_called ?? 0) + (em.tool_succeeded ?? 0) + (em.tool_failed ?? 0),
      toolUsage:         toolAgg.map((r: any) => ({ toolName: r._id, count: r.total, successRate: r.total > 0 ? Math.round((r.successes / r.total) * 100) : 0 })),
      averageConfidence: Math.round(confAgg[0]?.avg ?? 0),
      memoryHitRate:     total > 0 ? Math.round(((em.memory_hit ?? 0) / total) * 100) : 0,
      knowledgeHitRate:  total > 0 ? Math.round(((em.knowledge_hit ?? 0) / total) * 100) : 0,
      safetyBlocks:      em.safety_blocked ?? 0,
      sessionsByDay:     dailyAgg.map((r: any) => ({ date: r._id, count: r.count })),
    };
  },
};
