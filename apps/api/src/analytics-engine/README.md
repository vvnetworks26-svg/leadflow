# Layer 10 — Analytics Engine

## Mission

The Analytics Engine is the single source of truth for all conversation analytics, KPIs, reporting, and optimisation. It does not participate in conversations — it observes them.

```
Layer 1–9 (emit events)
         ↓
  Analytics Engine  ← HERE (read-only, observes all)
```

**Analytics is read-only. It never changes conversation behaviour.**

## Usage

```typescript
import { AnalyticsEngine } from './analytics-engine';

// Any layer tracks an event:
AnalyticsEngine.track({ type: 'booking_confirmed', organizationId, conversationId, payload: {} });

// Dashboard (real-time):
const snap = AnalyticsEngine.dashboard(organizationId);
// → { today: { visitors, bookings, bookingRate, handoffs, ... } }

// Reports:
const daily   = AnalyticsEngine.daily(organizationId);
const weekly  = AnalyticsEngine.weekly(organizationId);
const monthly = AnalyticsEngine.monthly(organizationId);
```

## Module map

| File | Responsibility | Pure? |
|------|---------------|-------|
| `AnalyticsEngine.ts` | Public entry point | ✅ |
| `AnalyticsCoordinator.ts` | In-memory event store + routing | ✅ |
| `EventProcessor.ts` | Event validation, filtering, batching | ✅ |
| `EventAggregator.ts` | Aggregates events into full AnalyticsReport | ✅ |
| `MetricsCalculator.ts` | Shared math: pct, avg, p50/p95, topN | ✅ |
| `ConversationMetrics.ts` | Start/complete/abandon, duration, turns | ✅ |
| `BookingMetrics.ts` | Attempts, confirmed, cancelled, conversion | ✅ |
| `IntentMetrics.ts` | Intent frequency, conversion, abandonment | ✅ |
| `ValidationMetrics.ts` | Failures, fallbacks, hallucination prevention | ✅ |
| `MemoryMetrics.ts` | Field coverage, completion, confidence | ✅ |
| `HandoffMetrics.ts` | Handoff rate, escalation reasons, destinations | ✅ |
| `FunnelAnalyzer.ts` | Stage-by-stage conversion funnel | ✅ |
| `DropoffAnalyzer.ts` | Where users leave, before/during booking | ✅ |
| `PerformanceAnalyzer.ts` | Latency p50/p95 per component | ✅ |
| `DashboardSnapshot.ts` | Today / this week / this month snapshots | ✅ |
| `AnalyticsReport.ts` | Daily / weekly / monthly report builder | ✅ |

## Supported events (28)

| Category | Events |
|----------|--------|
| Conversation | `conversation_started`, `conversation_completed`, `conversation_abandoned`, `stage_transition`, `turn_completed` |
| Intent | `intent_detected`, `intent_clarified` |
| Booking | `booking_requested`, `booking_confirmed`, `booking_cancelled`, `booking_rescheduled`, `booking_failed` |
| Validation | `validation_passed`, `validation_failed`, `fallback_used`, `hallucination_prevented`, `repetition_blocked` |
| Memory | `memory_updated`, `field_collected` |
| Handoff | `handoff_requested`, `handoff_completed`, `handoff_cancelled`, `human_requested`, `ai_confidence_low`, `complaint_detected` |
| Performance | `response_generated`, `blueprint_changed` |

## Dashboard snapshot

```json
{
  "today": {
    "visitors": 248,
    "conversations": 193,
    "bookings": 42,
    "bookingRate": 21.8,
    "handoffs": 7,
    "handoffRate": 3.6,
    "completions": 150,
    "abandonments": 43
  },
  "thisWeek": { ... },
  "thisMonth": { ... }
}
```

## Analytics report structure

Every report contains:
- `conversations` — total, completed, abandoned, rates, avg turns, p50/p95 duration
- `intents` — by intent: count, conversions, abandonment, conversion rate
- `bookings` — attempts, confirmed, failed, cancelled, conversion rate, failure reasons
- `validations` — pass/fail counts, fallbacks, hallucinations prevented
- `memory` — avg fields collected, completion rate, field coverage, low-confidence rate
- `handoffs` — total, by reason, by destination, handoff rate
- `funnel` — per-stage: entered, converted, abandoned, rates, avg time
- `performance` — p50/p95/avg per component (response_generated, booking, validation, handoff)

## KPIs answered

- How many visitors became leads? → `conversations.total`
- Which services are requested most? → `intents.byIntent` sorted by count
- Which stage loses customers? → `funnel.biggestDropoff`
- Which intents convert best? → `intents.byIntent[n].conversionRate`
- How many bookings? → `bookings.confirmed`
- Handoff rate? → `handoffs.handoffRate`
- AI hallucination prevention rate? → `validations.hallucinationsPrevented`
- Average conversation duration? → `conversations.avgDurationMs`
- Response latency p95? → `performance.overall.p95Ms`

## Performance

Pure synchronous aggregation. No network. No Gemini. No DB.
Target: p50 < 5ms, p95 < 20ms.

## Tests

```
src/analytics-engine/__tests__/analytics-engine.test.ts
  126 tests across 25 suites
```

Covers: EventProcessor, MetricsCalculator, ConversationMetrics, BookingMetrics, IntentMetrics, ValidationMetrics, MemoryMetrics, HandoffMetrics, FunnelAnalyzer, DropoffAnalyzer, PerformanceAnalyzer, DashboardSnapshot, AnalyticsReport, EventAggregator, AnalyticsCoordinator, AnalyticsEngine, full pipeline integration.

---

## Framework Complete

This is Layer 10 — the final layer of the LeadFlow Conversation Framework v2.0.

**Total tests: 781 across all 10 layers. Zero TypeScript errors.**

The framework is now frozen for Beta. Next phase: refinement, integration, and shipping the first paying customer.
