# Layer 7 — Tool Orchestration Engine

## What it does

Tool Orchestration sits between the Memory Engine and Gemini. It converts conversation state into deterministic business actions. The LLM never decides which tools to execute.

```
L1 Business Identity
L2 Intent Understanding
L3 Conversation Planner
L4 Response Engine
L5 Prompt Assembly
L6 Memory Engine
         ↓
   Layer 7 ← HERE
         ↓
   Gemini (renderer only)
```

## Quick start

```typescript
import { ToolOrchestrator } from './tool-orchestration';

// In runOrchestrator():
const toolResult = await ToolOrchestrator.run({
  organizationId, conversationId,
  intent, memory, stage, workflowState,
  objective, qualification, identity,
  turnCount, userMessage,
});

// toolResult.contextBlock  → inject into Gemini system prompt
// toolResult.booking       → confirmation code, booking ID
// toolResult.availability  → slots for Gemini to mention
// toolResult.lead          → leadId for subsequent turns
// toolResult.escalated     → set stage to 'escalated'
```

## Module map

| File | Responsibility | Pure? |
|------|---------------|-------|
| `ToolRegistry.ts` | Metadata for all 9 tools | ✅ |
| `ToolPlanner.ts` | Selects tools + produces ExecutionPlan | ✅ |
| `ToolSelector.ts` | 8 priority rules → ToolCall list | ✅ |
| `DependencyResolver.ts` | DAG topological sort → ExecutionWaves | ✅ |
| `ToolGuards.ts` | Pre-execution field validation | ✅ |
| `ParallelExecutor.ts` | Wave-by-wave execution with cache + retry | ⚡ |
| `ToolExecutor.ts` | Individual tool implementations (DB calls) | ⚡ |
| `RetryPolicy.ts` | Retry strategies + circuit breaker | ⚡ |
| `ToolCache.ts` | Conversation-scoped result cache | ✅ |
| `ToolMetrics.ts` | Per-tool latency, success rate, p95 | ✅ |
| `ExecutionContext.ts` | Raw results → Gemini-ready prose | ✅ |
| `ToolResultBuilder.ts` | Immutable aggregate execution result | ✅ |
| `ToolOrchestrator.ts` | Full pipeline entry point | ⚡ |
| `ToolOrchestrationEngine.ts` | Legacy-compatible entry point | ⚡ |
| `MemoryBugFixes.ts` | BUG-H1, BUG-M3, BUG-L1 fixes | ✅ |

## Tool catalogue

| Tool | Category | Write? | Cacheable | Dependencies |
|------|----------|--------|-----------|--------------|
| `check_availability` | availability | no | yes (5 min) | — |
| `book_appointment` | booking | **yes** | no | check_availability, create_lead |
| `create_lead` | lead | yes (upsert) | yes | — |
| `update_lead` | lead | yes | no | create_lead |
| `lookup_faq` | knowledge | no | yes (10 min) | — |
| `get_estimate` | pricing | no | yes (30 min) | — |
| `send_sms` | notification | yes | no | book_appointment |
| `send_email` | notification | yes | no | book_appointment |
| `escalate` | escalation | no | no | — |

## Selection rules (priority order)

1. Emergency (critical/emergency urgency) → `check_availability` + `escalate`
2. Human escalation request → `escalate`
3. Booking stage → `check_availability` + `book_appointment` (if data complete)
4. Lead upsert → `create_lead` (when name + contact collected, turn ≥ 1)
5. Post-booking → `send_sms` + `send_email` (if bookingStatus = 'booked')
6. FAQ intents → `lookup_faq`
7. Estimate intents → `get_estimate`

## Execution pipeline

```
ToolPlanner.plan(ctx)          → ExecutionPlan (waves + graph)
ToolGuards.filter(calls, ctx)  → allowed / blocked
DependencyResolver.resolve()   → ExecutionGraph
ParallelExecutor.execute()     → ToolExecutionRecords[]
  └─ ToolCache.get()           → skip execution on hit
  └─ withRetry()               → retry + circuit breaker
  └─ ToolExecutor.run()        → actual DB / service call
  └─ ToolMetrics.record*()     → latency tracking
ToolResultBuilder.build()      → ToolExecutionResult
ExecutionContext.build()        → contextBlock for Gemini
```

## Adding a new tool

1. Add the tool name to `ToolName` union in `types.ts`
2. Register it in `ToolRegistry.ts` with dependencies, retry, cache, priority
3. Add execution logic to `ToolExecutor.ts`
4. Add guard logic to `ToolGuards.ts`
5. Add a selection rule to `ToolSelector.ts`
6. Add context formatter to `ExecutionContext.ts`

No other files change.

## Performance targets

| Metric | Target | Notes |
|--------|--------|-------|
| p50 (pure pipeline) | < 10 ms | Selector + resolver + guards |
| p95 (pure pipeline) | < 30 ms | Including cache lookup |
| Cache hit rate | > 60% | After warm-up (same conv) |
| Circuit breaker threshold | 3 failures | Per tool per conversation |

## Bug fixes included

- **BUG-H1**: `MemoryScorer` uses deterministic djb2 hash IDs (not `randomUUID`)
- **BUG-M3**: `business_closed` rule accepts injectable `nowMs` clock
- **BUG-L1**: `Support` intent maps to `general_question` (not `repair`)

## Tests

```
src/tool-orchestration/__tests__/
  tool-orchestration.test.ts   → 91 tests (selector, guards, aggregator, bug fixes)
  layer7-full.test.ts          → 100 tests (registry, planner, resolver, cache,
                                            metrics, retry, circuit breaker,
                                            context builder, result builder,
                                            orchestrator integration)
```

Total Layer 7: **191 tests**. All pass. Zero TypeScript errors.
