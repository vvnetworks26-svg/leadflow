/**
 * WorkflowDashboardService.ts — Automation engine performance metrics.
 */

import { WorkflowExecutionModel } from '../../models/WorkflowExecution.model';
import { WorkflowModel }          from '../../models/Workflow.model';
import { cached, TTL }            from '../cache/DashboardCache';

export interface WorkflowMetrics {
  totalRuns:          number;
  successRate:        number;
  failureRate:        number;
  retries:            number;
  avgRuntimeMs:       number;
  waitingCount:       number;
  runningCount:       number;
  mostUsedWorkflows:  Array<{ workflowId: string; name: string; runs: number; successRate: number }>;
  dailyRuns:          Array<{ date: string; runs: number; failures: number }>;
  actionTypeUsage:    Array<{ actionType: string; count: number }>;
  activeWorkflows:    number;
  pausedWorkflows:    number;
}

export const WorkflowDashboardService = {

  async get(organizationId: string): Promise<WorkflowMetrics> {
    return cached(organizationId, 'workflow_dash', TTL.SHORT, async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400_000);

      const [statusAgg, daily, activeWf, pausedWf, retries, waiting, running, actionAgg, topWf] = await Promise.all([
        WorkflowExecutionModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: weekAgo } } },
          { $group: { _id: '$status', count: { $sum: 1 }, avgMs: { $avg: '$durationMs' } } },
        ]),
        WorkflowExecutionModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: weekAgo } } },
          { $group: {
            _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            runs:     { $sum: 1 },
            failures: { $sum: { $cond: [{ $in: ['$status',['failed','timeout']] }, 1, 0] } },
          }},
          { $sort: { _id: 1 } },
        ]),
        WorkflowModel.countDocuments({ organizationId, status: 'active' }),
        WorkflowModel.countDocuments({ organizationId, status: 'paused' }),
        WorkflowExecutionModel.countDocuments({ organizationId, status: 'retrying' }),
        WorkflowExecutionModel.countDocuments({ organizationId, status: 'waiting' }),
        WorkflowExecutionModel.countDocuments({ organizationId, status: 'running' }),
        WorkflowExecutionModel.aggregate([
          { $match: { organizationId, createdAt: { $gte: weekAgo } } },
          { $unwind: '$steps' },
          { $group: { _id: '$steps.actionType', count: { $sum: 1 } } },
          { $sort: { count: -1 } }, { $limit: 10 },
        ]),
        WorkflowModel.aggregate([
          { $match: { organizationId } },
          { $project: { name: 1, runCount: 1, successCount: 1, failureCount: 1 } },
          { $sort: { runCount: -1 } }, { $limit: 5 },
        ]),
      ]);

      const sm: Record<string, { count: number; avgMs?: number }> = {};
      for (const r of statusAgg) sm[r._id] = { count: r.count, avgMs: r.avgMs };
      const total   = Object.values(sm).reduce((s, r) => s + r.count, 0);
      const success = sm.completed?.count ?? 0;
      const failed  = (sm.failed?.count ?? 0) + (sm.timeout?.count ?? 0);
      const avgMs   = Object.values(sm).reduce((s, r) => s + (r.avgMs ?? 0) * r.count, 0) / Math.max(total, 1);

      return {
        totalRuns:         total,
        successRate:       total > 0 ? Math.round((success / total) * 100) : 0,
        failureRate:       total > 0 ? Math.round((failed  / total) * 100) : 0,
        retries,
        avgRuntimeMs:      Math.round(avgMs),
        waitingCount:      waiting,
        runningCount:      running,
        mostUsedWorkflows: topWf.map((r: any) => ({
          workflowId:  r._id.toString(), name: r.name,
          runs:        r.runCount,
          successRate: r.runCount > 0 ? Math.round((r.successCount / r.runCount) * 100) : 0,
        })),
        dailyRuns:         daily.map((r: any) => ({ date: r._id, runs: r.runs, failures: r.failures })),
        actionTypeUsage:   actionAgg.map((r: any) => ({ actionType: r._id ?? 'unknown', count: r.count })),
        activeWorkflows:   activeWf,
        pausedWorkflows:   pausedWf,
      };
    });
  },
};
