/**
 * tool-orchestration/ToolMetrics.ts
 *
 * Runtime metrics for Layer 7 tool executions.
 * Completely independent of business logic.
 *
 * Tracks per-tool:
 *   - execution count
 *   - success / failure / retry counts
 *   - latency histogram (for p50 / p95 calculation)
 *   - timeout count
 *   - cache hit ratio
 *
 * PURE data structure — no I/O, no external dependencies.
 */

import type { ToolName } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolMetricSnapshot {
  readonly tool:         ToolName;
  readonly executions:   number;
  readonly successes:    number;
  readonly failures:     number;
  readonly retries:      number;
  readonly timeouts:     number;
  readonly cacheHits:    number;
  readonly totalMs:      number;
  readonly avgLatencyMs: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
  readonly successRate:  number;   // 0–1
}

export interface GlobalMetricSnapshot {
  readonly tools:              readonly ToolMetricSnapshot[];
  readonly totalExecutions:    number;
  readonly totalSuccesses:     number;
  readonly totalFailures:      number;
  readonly overallSuccessRate: number;
  readonly overallAvgLatencyMs:number;
  readonly recordedAt:         string;
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface ToolState {
  executions: number;
  successes:  number;
  failures:   number;
  retries:    number;
  timeouts:   number;
  cacheHits:  number;
  latencies:  number[];   // kept sorted for percentile calc
}

const _state = new Map<ToolName, ToolState>();

function getState(tool: ToolName): ToolState {
  if (!_state.has(tool)) {
    _state.set(tool, { executions: 0, successes: 0, failures: 0, retries: 0, timeouts: 0, cacheHits: 0, latencies: [] });
  }
  return _state.get(tool)!;
}

// ─── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

// ─── Metrics API ──────────────────────────────────────────────────────────────

export const ToolMetrics = {

  /** Record a successful execution. */
  recordSuccess(tool: ToolName, durationMs: number): void {
    const s = getState(tool);
    s.executions++;
    s.successes++;
    // Insert sorted (binary insertion for O(log n))
    const idx = sortedInsertIndex(s.latencies, durationMs);
    s.latencies.splice(idx, 0, durationMs);
  },

  /** Record a failed execution. */
  recordFailure(tool: ToolName, durationMs: number, isTimeout = false): void {
    const s = getState(tool);
    s.executions++;
    s.failures++;
    if (isTimeout) s.timeouts++;
    const idx = sortedInsertIndex(s.latencies, durationMs);
    s.latencies.splice(idx, 0, durationMs);
  },

  /** Record a retry attempt (does not count as a new execution). */
  recordRetry(tool: ToolName): void {
    getState(tool).retries++;
  },

  /** Record a cache hit (no execution occurred). */
  recordCacheHit(tool: ToolName): void {
    const s = getState(tool);
    s.cacheHits++;
  },

  /** Snapshot for a single tool. */
  snapshot(tool: ToolName): ToolMetricSnapshot {
    const s = getState(tool);
    const total = s.executions;
    const avg   = s.latencies.length > 0
      ? s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length
      : 0;

    return {
      tool,
      executions:    total,
      successes:     s.successes,
      failures:      s.failures,
      retries:       s.retries,
      timeouts:      s.timeouts,
      cacheHits:     s.cacheHits,
      totalMs:       s.latencies.reduce((a, b) => a + b, 0),
      avgLatencyMs:  Math.round(avg),
      p50LatencyMs:  percentile(s.latencies, 50),
      p95LatencyMs:  percentile(s.latencies, 95),
      successRate:   total > 0 ? s.successes / total : 0,
    };
  },

  /** Global snapshot across all tools. */
  global(): GlobalMetricSnapshot {
    const tools = [..._state.keys()].map(t => ToolMetrics.snapshot(t));
    const total    = tools.reduce((s, t) => s + t.executions, 0);
    const successes= tools.reduce((s, t) => s + t.successes, 0);
    const failures = tools.reduce((s, t) => s + t.failures, 0);
    const totalMs  = tools.reduce((s, t) => s + t.totalMs, 0);
    const execs    = tools.reduce((s, t) => s + t.executions, 0);

    return {
      tools,
      totalExecutions:     total,
      totalSuccesses:      successes,
      totalFailures:       failures,
      overallSuccessRate:  total > 0 ? successes / total : 0,
      overallAvgLatencyMs: execs > 0 ? Math.round(totalMs / execs) : 0,
      recordedAt:          new Date().toISOString(),
    };
  },

  /** Reset all metrics (for tests). */
  reset(): void {
    _state.clear();
  },

  /** Reset metrics for a single tool. */
  resetTool(tool: ToolName): void {
    _state.delete(tool);
  },
};

// ─── Binary insertion helper ──────────────────────────────────────────────────

function sortedInsertIndex(arr: number[], val: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
