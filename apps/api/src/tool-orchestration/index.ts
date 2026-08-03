/**
 * tool-orchestration/index.ts
 *
 * Layer 7 — Public API surface.
 * Import from here, not from individual files.
 */

export { ToolOrchestrationEngine }    from './ToolOrchestrationEngine';
export { ToolSelector }               from './ToolSelector';
export { ToolGuards }                 from './ToolGuards';
export { ToolResultAggregator }       from './ToolResultAggregator';
export { stableMemoryId, isBusinessClosed, INTENT_CATEGORY_MAP } from './MemoryBugFixes';

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
