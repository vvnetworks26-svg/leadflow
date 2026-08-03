/**
 * tool-orchestration/ToolResultBuilder.ts
 *
 * Aggregates outputs from multiple executed tools into one immutable
 * ToolExecutionResult.
 *
 * The result includes:
 *   - successful outputs per tool
 *   - failures with error messages
 *   - skipped tools (guard-blocked)
 *   - cached tool results
 *   - execution duration
 *   - execution graph (wave order)
 *   - metrics snapshot
 *
 * PURE — no I/O.
 */

import type { ToolName } from './types';
import type { ExecutionGraph } from './DependencyResolver';
import type { GlobalMetricSnapshot } from './ToolMetrics';

// ─── Rich result types ────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'success'
  | 'failure'
  | 'skipped'
  | 'cached'
  | 'circuit_open';

export interface ToolExecutionRecord {
  readonly tool:       ToolName;
  readonly status:     ExecutionStatus;
  readonly data:       unknown;
  readonly error?:     string;
  readonly durationMs: number;
  readonly attempts:   number;
  readonly fromCache:  boolean;
}

/** Immutable aggregate result of the entire Layer 7 pipeline */
export interface ToolExecutionResult {
  readonly conversationId:  string;
  readonly organizationId:  string;
  readonly results:         readonly ToolExecutionRecord[];
  readonly successful:      readonly ToolExecutionRecord[];
  readonly failed:          readonly ToolExecutionRecord[];
  readonly skipped:         readonly ToolExecutionRecord[];
  readonly cached:          readonly ToolExecutionRecord[];
  readonly graph:           ExecutionGraph;
  readonly metricsSnapshot: GlobalMetricSnapshot;
  readonly totalDurationMs: number;
  readonly executedAt:      string;   // ISO timestamp
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export interface ToolExecutionRecordInput {
  tool:       ToolName;
  status:     ExecutionStatus;
  data?:      unknown;
  error?:     string;
  durationMs: number;
  attempts?:  number;
  fromCache?: boolean;
}

export const ToolResultBuilder = {

  /**
   * Build an immutable ToolExecutionResult from raw records.
   * Pure function — no side effects.
   */
  build(params: {
    conversationId:  string;
    organizationId:  string;
    records:         ToolExecutionRecordInput[];
    graph:           ExecutionGraph;
    metricsSnapshot: GlobalMetricSnapshot;
    totalDurationMs: number;
  }): ToolExecutionResult {
    const results: ToolExecutionRecord[] = params.records.map(r => Object.freeze({
      tool:       r.tool,
      status:     r.status,
      data:       r.data ?? null,
      error:      r.error,
      durationMs: r.durationMs,
      attempts:   r.attempts ?? 1,
      fromCache:  r.fromCache ?? false,
    }));

    return Object.freeze({
      conversationId:  params.conversationId,
      organizationId:  params.organizationId,
      results:         Object.freeze(results),
      successful:      Object.freeze(results.filter(r => r.status === 'success' || r.status === 'cached')),
      failed:          Object.freeze(results.filter(r => r.status === 'failure' || r.status === 'circuit_open')),
      skipped:         Object.freeze(results.filter(r => r.status === 'skipped')),
      cached:          Object.freeze(results.filter(r => r.fromCache)),
      graph:           params.graph,
      metricsSnapshot: params.metricsSnapshot,
      totalDurationMs: params.totalDurationMs,
      executedAt:      new Date().toISOString(),
    });
  },

  /** Build an empty result (no tools ran). */
  empty(
    conversationId:  string,
    organizationId:  string,
    graph:           ExecutionGraph,
    metricsSnapshot: GlobalMetricSnapshot,
  ): ToolExecutionResult {
    return ToolResultBuilder.build({
      conversationId, organizationId,
      records:         [],
      graph,
      metricsSnapshot,
      totalDurationMs: 0,
    });
  },

  /** Merge two results (e.g. from parallel execution waves). */
  merge(a: ToolExecutionResult, b: ToolExecutionResult): ToolExecutionResult {
    return Object.freeze({
      conversationId:  a.conversationId,
      organizationId:  a.organizationId,
      results:         Object.freeze([...a.results, ...b.results]),
      successful:      Object.freeze([...a.successful, ...b.successful]),
      failed:          Object.freeze([...a.failed, ...b.failed]),
      skipped:         Object.freeze([...a.skipped, ...b.skipped]),
      cached:          Object.freeze([...a.cached, ...b.cached]),
      graph:           a.graph,
      metricsSnapshot: b.metricsSnapshot,
      totalDurationMs: Math.max(a.totalDurationMs, b.totalDurationMs),
      executedAt:      b.executedAt,
    });
  },
};
