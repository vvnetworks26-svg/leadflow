# Layer 7 — Tool Orchestration Engine

## Overview

Tool Orchestration is the execution bridge between the AI conversation pipeline and
real-world services (calendar, CRM, communications). It answers the question:

> **Given what we know about this conversation, which tools should run right now, with
> what parameters, and in what order?**

The layer is split into pure decision logic (no I/O) and a thin execution wrapper
(I/O only when allowed by guards).

---

## Module Structure

```
tool-orchestration/
├── types.ts                  All domain types — no logic
├── ToolSelector.ts           Pure: decides WHICH tools to call
├── ToolGuards.ts             Pure: validates tool preconditions
├── ToolExecutor.ts           I/O:  executes allowed tool calls
├── ToolResultAggregator.ts   Pure: converts raw results to structured output
├── ToolOrchestrationEngine.ts Entry point — wires all four above
├── MemoryBugFixes.ts         Bug fixes: BUG-H1, BUG-M3, BUG-L1
└── index.ts                  Public API surface
```

---

## Data Flow

```
ToolSelectionContext (pure data)
        │
        ▼
  ToolSelector.select()        ← PURE — returns ToolOrchestrationPlan
        │
        ▼
  ToolGuards.filter()          ← PURE — filters to allowed calls
        │
        ▼
  ToolExecutor.run*()          ← I/O   — calls DB, external services
        │
        ▼
  ToolResultAggregator.aggregate() ← PURE — builds ToolOrchestrationResult
        │
        ▼
  ToolOrchestrationResult      (availability, booking, lead, estimate, errors)
```

---

## Tool Catalogue

| Tool               | I/O?  | Idempotent | Guard             |
|--------------------|-------|------------|-------------------|
| check_availability | read  | yes        | always allowed    |
| book_appointment   | write | no         | name + contact    |
| create_lead        | write | yes (upsert)| name + contact   |
| update_lead        | write | yes        | name + contact    |
| lookup_faq         | read  | yes        | query >= 3 chars  |
| get_estimate       | pure  | yes        | service required  |
| send_sms           | write | no         | phone required    |
| send_email         | write | no         | valid email       |
| escalate           | log   | yes        | always allowed    |

---

## Selection Rules (priority order)

1. **Emergency** (urgency critical/emergency) → check_availability + escalate
2. **Explicit escalation** (requiresHuman / human_representative) → escalate
3. **Booking path** → check_availability always; book_appointment when data complete
4. **Lead upsert** → create_lead when name + phone/email collected (turn ≥ 1)
5. **Post-booking notifications** → send_sms + send_email when bookingStatus = 'booked'
6. **FAQ** → lookup_faq for question intents
7. **Estimate** → get_estimate for pricing/repair/install intents
8. **Default** → no tools

---

## Bug Fixes Applied

### BUG-H1 (High) — Stable MemoryItem IDs
- **File:** `memory-engine/MemoryScorer.ts`
- **Fix:** Replaced `randomUUID()` with `deterministicId(key)` (djb2 hash).
- **Impact:** MemoryEngine.process() now produces the same ID for the same field
  across all turns, enabling stable deduplication and MongoDB upsert.

### BUG-M3 (Medium) — Injectable clock for business_closed rule
- **File:** `conversation-engine/modules/rule-engine.ts`
- **Fix:** Added `nowMs?: number` to `RuleContext`. Passed as `new Date(nowMs)`
  to `isOpen()`. Production defaults to `Date.now()`.
- **Impact:** `business_closed` rule is now fully testable without real-clock sleeps.

### BUG-L1 (Low) — Support intent maps to general_question
- **File:** `ai/orchestrator.ts`
- **Fix:** Changed `Support → 'repair'` to `Support → 'general_question'` in
  `mapToIntentCategory()`.
- **Impact:** Support inquiries no longer get repair-service tone and dispatcher CTAs.

---

## Integration Points

### Incoming (consumed)
- **Layer 1 BusinessIdentity** → identity.servicesCatalog, contactInfo.timezone
- **Layer 2 ResolvedIntent** → category, urgency, requiresHuman, detectedService
- **Layer 3 ConversationPlan** → objective, workflowState
- **Layer 4 ResponseBlueprint** → (downstream, not consumed here)
- **Layer 6 MemoryProfile** → items used to build ToolSelectionContext

### Outgoing (produces)
- `ToolOrchestrationResult.availability` → injected into PromptAssembler as knowledge
- `ToolOrchestrationResult.booking` → written to AIConversationSession.memory
- `ToolOrchestrationResult.lead` → leadId stored for subsequent turns
- `ToolOrchestrationResult.estimate` → injected into KNOWLEDGE section of prompt
- `ToolOrchestrationResult.escalated` → triggers updatedStage = 'escalated'

---

## Orchestrator Integration Plan

Replace the legacy `executeTool / selectAutoTools` calls in `ai/orchestrator.ts`:

```typescript
// BEFORE (legacy)
const autoToolNames = selectAutoTools(userMessage, stage, intent.intent);
for (const toolName of autoToolNames) {
  const result = await executeTool(toolName, { query: userMessage }, organizationId, updatedMemory);
  toolsUsed.push(result);
}

// AFTER (Layer 7)
const toolCtx: ToolSelectionContext = {
  organizationId, conversationId, intent, memory: richMemory,
  stage: nextStage, workflowState, objective: l3Plan.objective,
  qualification, identity, turnCount, userMessage,
};
const toolResult = await ToolOrchestrationEngine.run(toolCtx);
// toolResult.availability, toolResult.booking, toolResult.lead available
```

---

## Testing Strategy

- `ToolSelector`: 100% deterministic — test all 8 selection rules
- `ToolGuards`: test each guard: allowed / blocked / missing fields
- `ToolResultAggregator`: test slot normalization, booking extraction, error aggregation
- `MemoryBugFixes`: test stable IDs, business_closed with injected clock
- Integration: test full emergency, booking, and FAQ flows end-to-end (dry-run)
