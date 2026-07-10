/**
 * WorkflowAnalyticsService.ts — Tracks and aggregates workflow execution metrics.
 */

import { WorkflowExecutionModel }  from '../../models/WorkflowExecution.model';
import { WorkflowModel }           from '../../models/Workflow.model';
import { logger }                  from '../../utils/logger';

export type WorkflowEventType =
  | 'workflow_triggered' | 'workflow_completed' | 'workflow_failed'
  | 'workflow_cancelled' | 'workflow_timeout'   | 'step_completed'
  | 'step_failed'        | 'retry_attempted'    | 'delay_started';

interface TrackParams {
  organizationId: string;
  workflowId:     string;
  workflowName:   string;
  eventType:      WorkflowEventType;
  durationMs?:    number;
  stepCount?:     number;
  error?:         string;
}

export interface WorkflowStats {
  totalWorkflows:     number;
  activeWorkflows:    number;
  totalExecutions:    number;
  successRate:        number;   // %
  failureRate:        number;   // %
  averageDurationMs:  number;
  mostUsedWorkflows:  Array<{ workflowId: string; name: string; runCount: number }>;
  executionsByDay:    Array<{ date: string; count: number; successCount: number }>;
  aiActionCount:      number;
  recentFailures:     Array<{ workflowId: string; workflowName: string; error: string; at: Date }>;
}

export const WorkflowAnalyticsService = {

  track(params: TrackParams): void {
    // Fire-and-forget — just update workflow counters
    // Detailed analytics come from WorkflowExecution documents
    if (params.eventType === 'workflow_completed') {
      WorkflowModel.findByIdAndUpdate(params.workflowId, { $inc: { successCount: 1 } }).catch(() => {});
    } else if (params.eventType === 'workflow_failed') {
      WorkflowModel.findByIdAndUpdate(params.workflowId, { $inc: { failureCount: 1 } }).catch(() => {});
    }
  },

  async getStats(organizationId: string, since?: Date): Promise<WorkflowStats> {
    const fromDate = since ?? new Date(Date.now() - 30 * 86400_000);

    const [
      totalWorkflows,
      activeWorkflows,
      execStats,
      byDay,
      topWorkflows,
      recentFails,
    ] = await Promise.all([
      WorkflowModel.countDocuments({ organizationId }),
      WorkflowModel.countDocuments({ organizationId, status: 'active' }),

      WorkflowExecutionModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: {
          _id:           null,
          total:         { $sum: 1 },
          completed:     { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
          failed:        { $sum: { $cond: [{ $in: ['$status',['failed','timeout']] }, 1, 0] } },
          avgDuration:   { $avg: '$durationMs' },
        }},
      ]),

      WorkflowExecutionModel.aggregate([
        { $match: { organizationId, createdAt: { $gte: fromDate } } },
        { $group: {
          _id:          { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count:        { $sum: 1 },
          successCount: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),

      WorkflowModel.find({ organizationId })
        .sort({ runCount: -1 }).limit(5)
        .select('name runCount').lean(),

      WorkflowExecutionModel.find({
        organizationId,
        status:    { $in: ['failed','timeout'] },
        createdAt: { $gte: fromDate },
      }).sort({ createdAt: -1 }).limit(10)
        .select('workflowId workflowName error startedAt').lean(),
    ]);

    const es      = execStats[0] ?? { total: 0, completed: 0, failed: 0, avgDuration: 0 };
    const total   = es.total   ?? 0;

    // Count AI actions used across all executions
    const aiCount = await WorkflowExecutionModel.aggregate([
      { $match: { organizationId, createdAt: { $gte: fromDate } } },
      { $unwind: '$steps' },
      { $match: { 'steps.actionType': { $regex: '^ai_' } } },
      { $count: 'total' },
    ]).then(r => r[0]?.total ?? 0);

    return {
      totalWorkflows,
      activeWorkflows,
      totalExecutions:   total,
      successRate:       total > 0 ? Math.round((es.completed / total) * 100) : 0,
      failureRate:       total > 0 ? Math.round((es.failed    / total) * 100) : 0,
      averageDurationMs: Math.round(es.avgDuration ?? 0),
      mostUsedWorkflows: topWorkflows.map((w: any) => ({ workflowId: w._id.toString(), name: w.name, runCount: w.runCount })),
      executionsByDay:   byDay.map((r: any) => ({ date: r._id, count: r.count, successCount: r.successCount })),
      aiActionCount:     aiCount,
      recentFailures:    recentFails.map((r: any) => ({
        workflowId:   r.workflowId,
        workflowName: r.workflowName,
        error:        r.error ?? '',
        at:           r.startedAt,
      })),
    };
  },
};
