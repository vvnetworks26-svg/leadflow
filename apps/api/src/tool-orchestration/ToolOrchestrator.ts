/**
 * tool-orchestration/ToolOrchestrator.ts
 *
 * Layer 7 — Full Tool Orchestrator.
 *
 * This is the production entry point. It wires the full pipeline:
 *
 *   ToolPlanner        → ExecutionPlan        (pure)
 *   ToolGuards.filter  → allowed / blocked    (pure)
 *   DependencyResolver → ExecutionGraph       (pure)
 *   ParallelExecutor   → raw records          (I/O, with cache + retry + metrics)
 *   ToolResultBuilder  → ToolExecutionResult  (pure)
 *   ExecutionContext   → contextBlock string  (pure)
 *
 * The orchestrator (ai/orchestrator.ts) calls this once per turn.
 * Gemini receives only the contextBlock — never raw tool data.
 */

import type { ToolSelectionContext, ToolOrchestrationResult } from './types';
import { ToolPlanner }         from './ToolPlanner';
import { ToolGuards }          from './ToolGuards';
import { DependencyResolver }  from './DependencyResolver';
import { ParallelExecutor }    from './ParallelExecutor';
import { ToolResultBuilder }   from './ToolResultBuilder';
import { ToolMetrics }         from './ToolMetrics';
import { ExecutionContext }     from './ExecutionContext';
import { ToolResultAggregator }from './ToolResultAggregator';

// ─── Output types ─────────────────────────────────────────────────────────────

export type { ToolExecutionResult } from './ToolResultBuilder';
export type { ExecutionPlan }       from './ToolPlanner';
export type { ExecutionContextOutput } from './ExecutionContext';

// ─── Main API ─────────────────────────────────────────────────────────────────

export const ToolOrchestrator = {

  /**
   * Full production pipeline.
   *
   * Returns ToolOrchestrationResult (backward-compatible with existing orchestrator)
   * AND the richer ToolExecutionResult via `.executionResult` for new consumers.
   */
  async run(ctx: ToolSelectionContext): Promise<ToolOrchestrationResult & {
    executionResult:  import('./ToolResultBuilder').ToolExecutionResult;
    contextBlock:     string;
  }> {
    const start = Date.now();

    // Step 1: Plan
    const plan = ToolPlanner.plan(ctx);

    if (plan.calls.length === 0) {
      const graph   = plan.graph;
      const metrics = ToolMetrics.global();
      const emptyExec = ToolResultBuilder.empty(ctx.conversationId, ctx.organizationId, graph, metrics);
      const legacyEmpty = ToolResultAggregator.empty({ calls: [], runInParallel: true, reason: plan.reason, dryRun: false });
      return {
        ...legacyEmpty,
        executionResult: emptyExec,
        contextBlock:    '',
      };
    }

    // Step 2: Guard
    const { allowed, blocked } = ToolGuards.filter(plan.calls, ctx);
    const guardErrors = blocked.map(b => `[${b.call.tool}] ${b.reason}`);

    // Create skipped records for blocked calls
    const skippedRecords = blocked.map(b => ({
      tool:       b.call.tool,
      status:     'skipped' as const,
      data:       null,
      error:      b.reason,
      durationMs: 0,
      attempts:   0,
      fromCache:  false,
    }));

    if (allowed.length === 0) {
      const graph   = DependencyResolver.resolve([]);
      const metrics = ToolMetrics.global();
      const execResult = ToolResultBuilder.build({
        conversationId:  ctx.conversationId,
        organizationId:  ctx.organizationId,
        records:         skippedRecords,
        graph,
        metricsSnapshot: metrics,
        totalDurationMs: 0,
      });
      const legacyPlan = { calls: plan.calls, runInParallel: plan.fullyParallel, reason: plan.reason, dryRun: false };
      const legacyEmpty = ToolResultAggregator.empty(legacyPlan);
      return {
        ...legacyEmpty,
        errors:          [...legacyEmpty.errors, ...guardErrors],
        executionResult: execResult,
        contextBlock:    '',
      };
    }

    // Step 3: Resolve dependencies for allowed calls
    const allowedNames = allowed.map(c => c.tool);
    const graph        = DependencyResolver.resolve(allowedNames);

    // Step 4: Execute (with cache, retry, metrics)
    const rawRecords = await ParallelExecutor.execute(allowed, graph, ctx);

    // Combine with skipped
    const allRecords = [...rawRecords, ...skippedRecords];

    // Step 5: Build rich result
    const totalDurationMs = Date.now() - start;
    const metrics         = ToolMetrics.global();
    const execResult      = ToolResultBuilder.build({
      conversationId:  ctx.conversationId,
      organizationId:  ctx.organizationId,
      records:         allRecords,
      graph,
      metricsSnapshot: metrics,
      totalDurationMs,
    });

    // Step 6: Build legacy-compatible result via existing aggregator
    const legacyPlan = { calls: allowed, runInParallel: plan.fullyParallel, reason: plan.reason, dryRun: false };
    const legacyResults = rawRecords.map(r => ({
      tool:       r.tool,
      status:     r.status === 'cached' ? 'success' as const : r.status as any,
      data:       r.data,
      error:      r.error,
      durationMs: r.durationMs,
    }));
    const legacyResult = ToolResultAggregator.aggregate(legacyPlan, legacyResults, totalDurationMs);

    // Step 7: Build conversational context for Gemini
    const ctxOutput   = ExecutionContext.build(execResult);
    const contextBlock = ctxOutput.contextBlock;

    return {
      ...legacyResult,
      errors:          [...legacyResult.errors, ...guardErrors],
      executionResult: execResult,
      contextBlock,
    };
  },

  /**
   * Preview: returns the plan without executing any tools.
   */
  preview(ctx: ToolSelectionContext): import('./ToolPlanner').ExecutionPlan {
    return ToolPlanner.preview(ctx);
  },

  /**
   * Describe the plan as a human-readable string.
   */
  describe(ctx: ToolSelectionContext): string {
    const plan = ToolPlanner.plan(ctx);
    return ToolPlanner.describe(plan);
  },
};
