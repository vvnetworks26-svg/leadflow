/**
 * tool-orchestration/ParallelExecutor.ts
 *
 * Executes tool calls concurrently within a wave.
 *
 * Guarantees:
 *   - Aggregation order is deterministic (original call order, not completion order)
 *   - Required tool failures short-circuit subsequent waves
 *   - Per-tool timeout enforced via RetryPolicy
 *   - Metrics recorded for every execution
 *   - Cache checked before execution; result stored after
 *
 * Design:
 *   Wave 0 (parallel): [check_availability, create_lead, lookup_faq]
 *     → Promise.all → results in original order
 *   Wave 1 (sequential): [book_appointment]
 *     → single execution → merge with wave 0
 */

import type { ToolCall, ToolResult } from './types';
import type { ToolSelectionContext }  from './types';
import type { ExecutionGraph, ExecutionWave } from './DependencyResolver';
import type { ToolExecutionRecordInput }      from './ToolResultBuilder';
import { ToolExecutor }   from './ToolExecutor';
import { ToolRegistry }   from './ToolRegistry';
import { ToolCache }      from './ToolCache';
import { withRetry }      from './RetryPolicy';
import { ToolMetrics }    from './ToolMetrics';

// ─── Internal per-call executor ───────────────────────────────────────────────

async function runCall(
  call:  ToolCall,
  ctx:   ToolSelectionContext,
): Promise<ToolExecutionRecordInput> {
  const descriptor = ToolRegistry.has(call.tool) ? ToolRegistry.get(call.tool) : null;
  const cacheConf  = descriptor?.cache;
  const retryConf  = descriptor?.retry;

  // ── Cache check ──────────────────────────────────────────────────────────
  if (cacheConf?.cacheable) {
    const cached = ToolCache.get(
      call.tool,
      call.params as Record<string, unknown>,
      cacheConf,
      ctx.conversationId,
      ctx.organizationId,
    );
    if (cached !== undefined) {
      ToolMetrics.recordCacheHit(call.tool);
      return {
        tool:       call.tool,
        status:     'cached',
        data:       cached,
        durationMs: 0,
        attempts:   0,
        fromCache:  true,
      };
    }
  }

  // ── Execute with retry ───────────────────────────────────────────────────
  const startMs = Date.now();

  if (retryConf) {
    let retryCount = 0;
    const result = await withRetry(
      async () => {
        if (retryCount > 0) ToolMetrics.recordRetry(call.tool);
        retryCount++;
        return ToolExecutor.run(call, ctx);
      },
      retryConf,
      call.tool,
      ctx.conversationId,
    );

    const durationMs = Date.now() - startMs;

    if (result.succeeded && result.value) {
      const toolResult = result.value as ToolResult;
      if (toolResult.status === 'success') {
        ToolMetrics.recordSuccess(call.tool, durationMs);
        if (cacheConf?.cacheable) {
          ToolCache.set(call.tool, call.params as Record<string, unknown>, toolResult.data, cacheConf, ctx.conversationId, ctx.organizationId);
        }
        return { tool: call.tool, status: 'success', data: toolResult.data, durationMs, attempts: result.attempts };
      } else {
        ToolMetrics.recordFailure(call.tool, durationMs, false);
        return { tool: call.tool, status: 'failure', data: null, error: toolResult.error ?? 'Tool returned failure', durationMs, attempts: result.attempts };
      }
    } else if (result.error?.message.startsWith('Circuit open')) {
      return { tool: call.tool, status: 'circuit_open', data: null, error: result.error.message, durationMs, attempts: 0 };
    } else {
      ToolMetrics.recordFailure(call.tool, durationMs, result.timedOut);
      return { tool: call.tool, status: 'failure', data: null, error: result.error?.message ?? 'Unknown error', durationMs, attempts: result.attempts };
    }
  }

  // No retry config — direct execution
  const durationMs = Date.now() - startMs;
  try {
    const raw = await ToolExecutor.run(call, ctx);
    const d2  = Date.now() - startMs;
    if (raw.status === 'success') {
      ToolMetrics.recordSuccess(call.tool, d2);
      if (cacheConf?.cacheable) {
        ToolCache.set(call.tool, call.params as Record<string, unknown>, raw.data, cacheConf, ctx.conversationId, ctx.organizationId);
      }
      return { tool: call.tool, status: 'success', data: raw.data, durationMs: d2, attempts: 1 };
    } else {
      ToolMetrics.recordFailure(call.tool, d2);
      return { tool: call.tool, status: 'failure', data: null, error: raw.error, durationMs: d2, attempts: 1 };
    }
  } catch (err: any) {
    const d2 = Date.now() - startMs;
    ToolMetrics.recordFailure(call.tool, d2);
    return { tool: call.tool, status: 'failure', data: null, error: err.message, durationMs: d2, attempts: 1 };
  }
}

// ─── Wave executor ────────────────────────────────────────────────────────────

async function executeWave(
  wave:  ExecutionWave,
  calls: ToolCall[],
  ctx:   ToolSelectionContext,
): Promise<ToolExecutionRecordInput[]> {
  const waveCalls = wave.tools
    .map(t => calls.find(c => c.tool === t))
    .filter((c): c is ToolCall => c !== undefined);

  if (waveCalls.length === 0) return [];

  if (wave.parallel) {
    // Run concurrently, collect in original order
    const results = await Promise.all(waveCalls.map(c => runCall(c, ctx)));
    // Re-sort by wave.tools order for deterministic output
    const ordered: ToolExecutionRecordInput[] = [];
    for (const toolName of wave.tools) {
      const r = results.find(r => r.tool === toolName);
      if (r) ordered.push(r);
    }
    return ordered;
  } else {
    // Sequential
    const results: ToolExecutionRecordInput[] = [];
    for (const call of waveCalls) {
      const r = await runCall(call, ctx);
      results.push(r);
      // Short-circuit: required tool failed
      if (r.status === 'failure' && call.required) break;
    }
    return results;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ParallelExecutor = {

  /**
   * Execute all tool calls according to the dependency graph.
   * Wave by wave — each wave may be parallel or sequential.
   */
  async execute(
    calls: ToolCall[],
    graph: ExecutionGraph,
    ctx:   ToolSelectionContext,
  ): Promise<ToolExecutionRecordInput[]> {
    // Fallback: if graph has cycles or no waves, run sequentially
    if (graph.hasCycles || graph.waves.length === 0) {
      const results: ToolExecutionRecordInput[] = [];
      for (const call of calls) {
        results.push(await runCall(call, ctx));
      }
      return results;
    }

    const all: ToolExecutionRecordInput[] = [];

    for (const wave of graph.waves) {
      const waveResults = await executeWave(wave, calls, ctx);
      all.push(...waveResults);

      // Check if any required tool in this wave failed — if so, stop
      const requiredFailure = waveResults.find(r => {
        if (r.status !== 'failure' && r.status !== 'circuit_open') return false;
        const call = calls.find(c => c.tool === r.tool);
        return call?.required ?? false;
      });

      if (requiredFailure) break;
    }

    return all;
  },

  /**
   * Execute a flat list of calls without dependency ordering.
   * Used when no graph is available.
   */
  async executeFlat(
    calls:    ToolCall[],
    parallel: boolean,
    ctx:      ToolSelectionContext,
  ): Promise<ToolExecutionRecordInput[]> {
    if (parallel) {
      return Promise.all(calls.map(c => runCall(c, ctx)));
    }
    const results: ToolExecutionRecordInput[] = [];
    for (const call of calls) {
      const r = await runCall(call, ctx);
      results.push(r);
      if (r.status === 'failure' && call.required) break;
    }
    return results;
  },
};
