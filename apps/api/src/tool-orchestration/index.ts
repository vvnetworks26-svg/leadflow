/**
 * tool-orchestration/index.ts
 *
 * Layer 7 — Public API surface.
 *
 * Primary entry point: ToolOrchestrator (full pipeline)
 * Legacy entry point:  ToolOrchestrationEngine (backward-compatible)
 */

// ─── Primary entry points ─────────────────────────────────────────────────────

export { ToolOrchestrator }            from './ToolOrchestrator';
export { ToolOrchestrationEngine }     from './ToolOrchestrationEngine';

// ─── Planning ─────────────────────────────────────────────────────────────────

export { ToolPlanner }                 from './ToolPlanner';
export { ToolSelector }                from './ToolSelector';
export { DependencyResolver }          from './DependencyResolver';

// ─── Execution ────────────────────────────────────────────────────────────────

export { ParallelExecutor }            from './ParallelExecutor';
export { ToolGuards }                  from './ToolGuards';

// ─── Registry & configuration ─────────────────────────────────────────────────

export { ToolRegistry }                from './ToolRegistry';

// ─── Data management ─────────────────────────────────────────────────────────

export { ToolCache }                   from './ToolCache';
export { ToolMetrics }                 from './ToolMetrics';
export { CircuitBreaker, withRetry }   from './RetryPolicy';

// ─── Result building ──────────────────────────────────────────────────────────

export { ToolResultBuilder }           from './ToolResultBuilder';
export { ToolResultAggregator }        from './ToolResultAggregator';
export { ExecutionContext }            from './ExecutionContext';

// ─── Bug fixes ────────────────────────────────────────────────────────────────

export { stableMemoryId, isBusinessClosed, INTENT_CATEGORY_MAP } from './MemoryBugFixes';

// ─── Type exports ─────────────────────────────────────────────────────────────

export type {
  ToolName,
  ToolCall,
  ToolResult,
  ToolResultStatus,
  ToolOrchestrationPlan,
  ToolOrchestrationResult,
  ToolSelectionContext,
  ToolGuardResult,
  AvailableSlot,
  AvailabilityResult,
  BookingResult,
  BookingParams,
  LeadResult,
  LeadUpsertParams,
  EstimateResult,
} from './types';

export type {
  ToolDescriptor,
  ToolCategory,
  ExecutionMode,
  RetryConfig,
  CacheConfig,
} from './ToolRegistry';

export type {
  ExecutionGraph,
  ExecutionWave,
} from './DependencyResolver';

export type {
  ExecutionPlan,
} from './ToolPlanner';

export type {
  ToolExecutionResult,
  ToolExecutionRecord,
  ExecutionStatus,
} from './ToolResultBuilder';

export type {
  ContextBlock,
  ExecutionContextOutput,
} from './ExecutionContext';

export type {
  ToolMetricSnapshot,
  GlobalMetricSnapshot,
} from './ToolMetrics';

export type {
  CacheEntry,
  CacheStats,
} from './ToolCache';

export type {
  CircuitState,
  CircuitBreakerStatus,
  RetryResult,
} from './RetryPolicy';
