/**
 * tool-orchestration/ToolOrchestrationEngine.ts
 *
 * Layer 7 — Main entry point.
 *
 * Wires ToolSelector → ToolGuards → ToolExecutor → ToolResultAggregator.
 *
 * Usage:
 *   const result = await ToolOrchestrationEngine.run(ctx);
 *   // result.availability, result.booking, result.lead, result.errors, etc.
 *
 * This is the only file the orchestrator (ai/orchestrator.ts) needs to import.
 */

import type { ToolSelectionContext, ToolOrchestrationResult, ToolOrchestrationPlan } from './types';
import { ToolSelector }          from './ToolSelector';
import { ToolGuards }            from './ToolGuards';
import { ToolExecutor }          from './ToolExecutor';
import { ToolResultAggregator }  from './ToolResultAggregator';

export const ToolOrchestrationEngine = {

  /**
   * Full execution pipeline:
   *   1. Select tools (pure)
   *   2. Guard each tool (pure)
   *   3. Execute allowed tools (I/O)
   *   4. Aggregate results (pure)
   */
  async run(ctx: ToolSelectionContext): Promise<ToolOrchestrationResult> {
    const start = Date.now();

    // Step 1: Determine which tools to call
    const plan = ToolSelector.select(ctx);

    // Nothing to do
    if (plan.calls.length === 0) {
      return ToolResultAggregator.empty(plan);
    }

    // Step 2: Guard all calls
    const { allowed, blocked } = ToolGuards.filter(plan.calls, ctx);

    // Collect blocked errors (soft — these are just informational)
    const guardErrors = blocked.map(b => `[${b.call.tool}] ${b.reason}`);

    if (allowed.length === 0) {
      const emptyResult = ToolResultAggregator.empty(plan);
      return {
        ...emptyResult,
        errors: guardErrors,
      };
    }

    // Step 3: Execute
    const effectivePlan: ToolOrchestrationPlan = {
      ...plan,
      calls: allowed,
    };

    let rawResults;
    if (plan.runInParallel && allowed.every(c => c.idempotent)) {
      rawResults = await ToolExecutor.runAll(allowed, ctx);
    } else {
      rawResults = await ToolExecutor.runSequential(allowed, ctx);
    }

    // Step 4: Aggregate
    const durationMs = Date.now() - start;
    const result     = ToolResultAggregator.aggregate(effectivePlan, rawResults, durationMs);

    return {
      ...result,
      errors: [...result.errors, ...guardErrors],
    };
  },

  /**
   * Dry-run: returns the plan only, does NOT execute.
   * Useful for tests, previews, and debug endpoints.
   */
  preview(ctx: ToolSelectionContext): ToolOrchestrationPlan {
    return ToolSelector.preview(ctx);
  },

  /**
   * Validate a context without executing — returns guard results.
   * Useful for pre-flight checks in tests.
   */
  validate(ctx: ToolSelectionContext): {
    plan:    ToolOrchestrationPlan;
    allowed: number;
    blocked: number;
    errors:  string[];
  } {
    const plan = ToolSelector.select(ctx);
    const { allowed, blocked } = ToolGuards.filter(plan.calls, ctx);
    return {
      plan,
      allowed: allowed.length,
      blocked: blocked.length,
      errors:  blocked.map(b => `[${b.call.tool}] ${b.reason}`),
    };
  },
};
