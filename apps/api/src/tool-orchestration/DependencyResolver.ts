/**
 * tool-orchestration/DependencyResolver.ts
 *
 * Resolves a set of tool calls into an ordered execution graph.
 *
 * Given a list of requested tool names:
 *   - Performs topological sort (Kahn's algorithm)
 *   - Groups independent tools into parallel execution waves
 *   - Detects cycles (throws on invalid configuration)
 *
 * Example:
 *   Input:  [book_appointment, create_lead, check_availability, send_sms]
 *   Output:
 *     Wave 0 (parallel): [check_availability, create_lead]
 *     Wave 1 (sequential): [book_appointment]      ← depends on wave 0
 *     Wave 2 (parallel): [send_sms]                ← depends on book_appointment
 *
 * PURE — no I/O, no side effects.
 */

import type { ToolName } from './types';
import { ToolRegistry }  from './ToolRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One wave of tools that can execute concurrently */
export interface ExecutionWave {
  readonly index:    number;
  readonly tools:    readonly ToolName[];
  readonly parallel: boolean;
}

/** The full resolved execution graph */
export interface ExecutionGraph {
  readonly waves:     readonly ExecutionWave[];
  readonly order:     readonly ToolName[];   // flat topological order
  readonly hasCycles: boolean;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export const DependencyResolver = {

  /**
   * Resolve the execution order for a set of tools.
   *
   * Only tools in `requested` are included. Dependencies that are not in
   * `requested` are ignored (the caller decides which tools to run).
   *
   * Kahn's algorithm — O(V + E).
   */
  resolve(requested: readonly ToolName[]): ExecutionGraph {
    const requested_set = new Set(requested);

    // Build adjacency: tool → its dependencies (that are also requested)
    const deps = new Map<ToolName, Set<ToolName>>();
    const rdeps = new Map<ToolName, Set<ToolName>>();   // reverse deps

    for (const tool of requested) {
      const descriptor = ToolRegistry.has(tool) ? ToolRegistry.get(tool) : null;
      const toolDeps   = (descriptor?.dependencies ?? []).filter(d => requested_set.has(d));
      deps.set(tool, new Set(toolDeps));
      for (const d of toolDeps) {
        if (!rdeps.has(d)) rdeps.set(d, new Set());
        rdeps.get(d)!.add(tool);
      }
    }

    // Initialize in-degree count
    const inDegree = new Map<ToolName, number>();
    for (const tool of requested) {
      inDegree.set(tool, deps.get(tool)?.size ?? 0);
    }

    // Kahn's — process waves
    const waves: ExecutionWave[] = [];
    const order: ToolName[]      = [];
    let   remaining              = new Set(requested);

    while (remaining.size > 0) {
      // Collect tools with zero in-degree (ready to execute)
      const ready = [...remaining].filter(t => (inDegree.get(t) ?? 0) === 0);

      if (ready.length === 0) {
        // Cycle detected — produce a degraded result
        return {
          waves:     [],
          order:     [...requested],  // fallback: original order
          hasCycles: true,
        };
      }

      // Sort by priority (descending) for deterministic ordering
      ready.sort((a, b) => {
        const pa = ToolRegistry.has(a) ? ToolRegistry.get(a).priority : 0;
        const pb = ToolRegistry.has(b) ? ToolRegistry.get(b).priority : 0;
        return pb - pa;
      });

      // Can tools in this wave run in parallel?
      const canParallel = ready.every(t =>
        ToolRegistry.has(t) && ToolRegistry.get(t).executionMode === 'parallel'
      );

      waves.push({
        index:    waves.length,
        tools:    ready,
        parallel: canParallel && ready.length > 1,
      });

      order.push(...ready);

      // Remove from remaining, decrement dependants
      for (const tool of ready) {
        remaining.delete(tool);
        for (const dependant of rdeps.get(tool) ?? []) {
          inDegree.set(dependant, (inDegree.get(dependant) ?? 1) - 1);
        }
      }
    }

    return { waves, order, hasCycles: false };
  },

  /**
   * Returns only the tools that can run in parallel in the first wave.
   * Useful for the quick path where no dependencies exist.
   */
  parallelGroup(requested: readonly ToolName[]): ToolName[] {
    const graph = DependencyResolver.resolve(requested);
    if (graph.hasCycles || graph.waves.length === 0) return [];
    return graph.waves[0]!.parallel ? [...graph.waves[0]!.tools] : [];
  },

  /**
   * Validate that a set of tools has no circular dependencies.
   * Returns true if valid (no cycles).
   */
  validate(requested: readonly ToolName[]): boolean {
    return !DependencyResolver.resolve(requested).hasCycles;
  },
};
