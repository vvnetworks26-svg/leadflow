# Layer 9 — Human Handoff Engine

## Mission

The Human Handoff Engine owns every AI-to-human transition. The Conversation Engine never performs handoffs directly — it only requests one.

```
Decision Engine
      ↓
Booking Engine
      ↓
Response Engine
      ↓
Validation Engine
      ↓
Human Handoff Engine  ← HERE
      ↓
Customer (or Human Agent)
```

## Usage

```typescript
import { HandoffEngine } from './handoff-engine';

const result = HandoffEngine.evaluate({
  organizationId, conversationId,
  memory:               richMemory,
  history,
  stage:                nextStage,
  urgency:              intent.urgency,
  intentCategory:       resolvedIntent.category,
  confidenceScore:      75,
  turnCount,
  identity,
  clarificationAttempts,
});

if (result.shouldHandoff) {
  reply        = result.bridgeMessage;   // AI says this to customer
  updatedStage = 'escalated';
  // result.context → send to human agent (has all collected data)
  // result.event   → feed to Layer 10 Analytics
}
```

## Module map

| File | Responsibility | Pure? |
|------|---------------|-------|
| `HandoffEngine.ts` | Public entry point | ✅ |
| `HandoffCoordinator.ts` | Full escalation pipeline | ✅ |
| `EscalationDetector.ts` | Message-pattern trigger detection | ✅ |
| `ConfidenceEvaluator.ts` | Low-confidence + stalled-conversation detection | ✅ |
| `HandoffRules.ts` | Routing table — reason → destination + priority | ✅ |
| `HandoffPolicy.ts` | Policy evaluator + bridge message builder | ✅ |
| `ConversationSummarizer.ts` | Deterministic HandoffSummary from memory | ✅ |
| `ContextBuilder.ts` | Structured AgentContext for human agents | ✅ |
| `HumanHandoff.ts` | Executes the full handoff lifecycle | ✅ |
| `HandoffEventBuilder.ts` | Builds all 6 event types + event bus | ✅ |

## Escalation triggers (priority order)

| # | Trigger | Reason | Priority |
|---|---------|--------|----------|
| 1 | Office closed + no after-hours | `office_hours_only` | normal |
| 2 | Post-booking policy | `booking_completed` | low |
| 3 | Critical/emergency urgency | `emergency_escalation` | **critical** |
| 4 | "speak to a person", "transfer me" | `customer_requested_human` | high |
| 5 | Legal threats | `legal_issue` | **critical** |
| 6 | Profanity | `profanity_detected` | high |
| 7 | Complaint / "this isn't helping" | `complaint_detected` | high |
| 8 | Frustration / "I already told you" | `frustration_detected` | high |
| 9 | Billing / refunds / invoices | `billing_question` | normal |
| 10 | Confidence below threshold | `low_ai_confidence` | normal |
| 11 | Clarification attempts exhausted | `repeated_clarification_failure` | normal |
| 12 | Business rule policy | `business_rule` | normal |

## Routing

All routing is policy-driven — no hardcoded destinations.

| Reason | Default destination | Priority |
|--------|-------------------|----------|
| `emergency_escalation` | dispatcher | critical |
| `legal_issue` | manager | critical |
| `complaint_detected` | manager | high |
| `profanity_detected` | manager | high |
| `customer_requested_human` | customer_support | high |
| `billing_question` | billing_department | normal |
| `payment_issue` | billing_department | high |
| `low_ai_confidence` | customer_support | normal |
| `vip_customer` | sales_team | high |

Override per-business by passing custom `RoutingRule[]` in `HandoffPolicy`.

## Conversation summary

The `HandoffSummary` is fully deterministic — no LLM:

```json
{
  "customer": { "name": "John Smith", "phone": "555-1234", "email": "..." },
  "service": "AC Repair",
  "intent": "repair",
  "urgency": "emergency",
  "conversationStage": "booking",
  "informationCollected": ["Name", "Phone", "Service"],
  "missingInformation": ["Email", "Address"],
  "reasonForHandoff": "customer_requested_human",
  "reasonDescription": "Customer explicitly asked to speak with a human agent.",
  "bookingStatus": "none"
}
```

## Events (feed Layer 10 Analytics)

| Event | When |
|-------|------|
| `handoff_requested` | Every handoff |
| `handoff_completed` | After agent takes over |
| `handoff_cancelled` | Handoff aborted |
| `human_requested` | Customer explicitly asked |
| `ai_confidence_low` | Confidence/stall trigger |
| `complaint_detected` | Complaint/frustration trigger |

```typescript
import { HandoffEventBus } from './handoff-engine';
HandoffEventBus.on(event => { /* Layer 10 Analytics */ });
```

## Performance

Synchronous. No network. No Gemini. No DB.
Target: p50 < 5 ms, p95 < 15 ms — validated in tests.

## Tests

```
src/handoff-engine/__tests__/handoff-engine.test.ts
  105 tests across 16 suites
```

Covers: EscalationDetector (all triggers), ConfidenceEvaluator, HandoffRules, HandoffPolicy, ConversationSummarizer, ContextBuilder, HandoffEventBuilder, HandoffEventBus, HumanHandoff, HandoffCoordinator, HandoffEngine, full integration lifecycle.
