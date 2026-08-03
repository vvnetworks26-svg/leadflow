/**
 * tool-orchestration/ToolPlanner.ts
 *
 * Layer 7 — Deterministic Execution Planner.
 *
 * Extends ToolSelector by producing a full ExecutionPlan that includes:
 *   - which tools to run (from ToolSelector)
 *   - dependency-resolved execution graph (from DependencyResolver)
 *   - parallelizable groups
 *   - fallback behaviour per tool
 *   - estimated execution time
 *
 * Input:  ToolSelectionContext  (pure data from Layers 1–6)
 * Output: ExecutionPlan         (pure, deterministic, no I/O)
 *
 * PURE — no I/O, no side effects.
 */

import type { ToolCall, ToolOrchestrationPlan, ToolSelectionContext } from './types';
import { ToolSelector }      from './ToolSelector';
import { DependencyResolver, type ExecutionGraph } from './DependencyResolver';
import { ToolRegistry }      from './ToolRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  /** The raw ordered list of tool calls */
  readonly calls:          readonly ToolCall[];
  /** Dependency-resolved execution graph with parallel waves */
  readonly graph:          ExecutionGraph;
  /** Human-readable reason for this plan */
  readonly reason:         string;
  /** Estimated p50 execution time in ms (sum of critical path) */
  readonly estimatedMs:    number;
  /** Whether the plan is a dry-run (no writes) */
  readonly dryRun:         boolean;
  /** Whether any tool in this plan requires a write operation */
  readonly hasWrites:      boolean;
  /** Whether this plan can be executed with all tools in parallel */
  readonly fullyParallel:  boolean;
}

// ─── Estimator ────────────────────────────────────────────────────────────────

/**
 * Estimate execution time based on the critical path through the dependency graph.
 * For parallel waves, takes the max of the wave. For sequential, sums them.
 */
function estimateMs(graph: ExecutionGraph): number {
  if (graph.hasCycles || graph.waves.length === 0) return 0;
  let total = 0;
  for (const wave of graph.waves) {
    const waveTimes = wave.tools.map(t => {
      return ToolRegistry.has(t) ? ToolRegistry.get(t).timeoutMs / 4 : 50; // use 1/4 of timeout as p50 estimate
    });
    // Parallel wave → max; sequential → sum of each tool
    total += wave.parallel ? Math.max(...waveTimes) : waveTimes.reduce((a, b) => a + b, 0);
  }
  return Math.round(total);
}

// ─── Planner ─────────────────────────────────────────────────────────────────

export const ToolPlanner = {

  /**
   * Produce the full ExecutionPlan for a conversation turn.
   *
   * Steps:
   *   1. ToolSelector.select → ToolOrchestrationPlan (calls + parallel flag)
   *   2. DependencyResolver.resolve → ExecutionGraph (waves)
   *   3. Annotate plan with estimates, write flags, etc.
   */
  plan(ctx: ToolSelectionContext): ExecutionPlan {
    // Step 1: select tools
    const orchestrationPlan: ToolOrchestrationPlan = ToolSelector.select(ctx);
    const calls = [...orchestrationPlan.calls];

    if (calls.length === 0) {
      return {
        calls:         [],
        graph:         { waves: [], order: [], hasCycles: false },
        reason:        orchestrationPlan.reason,
        estimatedMs:   0,
        dryRun:        false,
        hasWrites:     false,
        fullyParallel: true,
      };
    }

    // Step 2: resolve dependencies
    const toolNames = calls.map(c => c.tool);
    const graph     = DependencyResolver.resolve(toolNames);

    // Step 3: annotate
    const hasWrites    = calls.some(c => {
      return ToolRegistry.has(c.tool) ? ToolRegistry.get(c.tool).requiresWrite : !c.idempotent;
    });
    const fullyParallel = !graph.hasCycles
      && graph.waves.length === 1
      && (graph.waves[0]?.parallel ?? false);

    return {
      calls:         Object.freeze(calls),
      graph:         Object.freeze(graph),
      reason:        orchestrationPlan.reason,
      estimatedMs:   estimateMs(graph),
      dryRun:        orchestrationPlan.dryRun,
      hasWrites,
      fullyParallel,
    };
  },

  /**
   * Dry-run plan — marks dryRun=true so executor skips write operations.
   */
  preview(ctx: ToolSelectionContext): ExecutionPlan {
    const base = ToolPlanner.plan(ctx);
    return { ...base, dryRun: true };
  },

  /**
   * Describe the plan as a human-readable string (for logs / debug endpoints).
   */
  describe(plan: ExecutionPlan): string {
    if (plan.calls.length === 0) return 'No tools selected.';
    const lines: string[] = [`Plan: ${plan.reason}`, `  Estimated: ~${plan.estimatedMs}ms`];
    for (const wave of plan.graph.waves) {
      const mode = wave.parallel ? '(parallel)' : '(sequential)';
      lines.push(`  Wave ${wave.index} ${mode}: [${wave.tools.join(', ')}]`);
    }
    return lines.join('\n');
  },
};
