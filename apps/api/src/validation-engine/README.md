# Layer 7 — Validation Engine

## What it does

The Validation Engine is the mandatory QA gate between the Response Engine and the customer. It validates every proposed response before it is delivered.

```
Decision Engine
      ↓
Response Engine  ← proposes
      ↓
Validation Engine  ← approves or replaces  ← HERE
      ↓
Customer
```

The Validation Engine:
- Never calls Gemini
- Never generates prompts
- Never makes business decisions
- Only validates — and produces deterministic fallbacks when validation fails

## Pipeline

Validators run in this order. The pipeline short-circuits on the first `fail`:

| # | Validator | Guards against |
|---|-----------|----------------|
| 1 | `MemoryValidator` | Re-asking for already-collected fields |
| 2 | `BlueprintValidator` | Invalid CTA/stage combos, premature booking |
| 3 | `ObjectiveValidator` | Multiple objectives, missing objective |
| 4 | `RepetitionValidator` | Exact or near-duplicate recent messages |
| 5 | `ToneValidator` | Brand tone violations per industry |
| 6 | `UrgencyValidator` | Non-emergency response to emergency |
| 7 | `BookingValidator` | Incomplete booking preconditions |
| 8 | `BusinessRuleValidator` | Closed hours, disabled emergency, service area |
| 9 | `HallucinationValidator` | Fake prices, guarantees, technician names |
| 10 | `ResponseQualityValidator` | Response helps nobody, moves nothing forward |

## Usage

```typescript
import { ValidationEngine } from './validation-engine';

// After Gemini produces `reply`:
const validationCtx: ValidationContext = {
  proposedResponse: reply,
  stage:            nextStage,
  blueprint,
  memory:           richMemory,
  history,
  urgency:          intent.urgency,
  identity,
  turnCount,
};

const validated = ValidationEngine.validate(validationCtx);
reply = validated.finalResponse;   // approved or deterministic fallback
```

## Fallback strategy

Every validator has a corresponding fallback in `FallbackResponseBuilder`. When validation fails:

| Failure | Fallback |
|---------|----------|
| `MemoryValidator` | Ask for next uncollected field |
| `RepetitionValidator` | Ask for next uncollected field |
| `BlueprintValidator` | Stage-appropriate default |
| `BookingValidator` | Collect missing field |
| `HallucinationValidator` | Refer to team + phone number |
| `BusinessRuleValidator` | Leave contact info for callback |
| `UrgencyValidator` | Acknowledge urgency + ask for phone |
| `ToneValidator` | Stage default |
| `ObjectiveValidator` | Next field question |

## Validation rules

### Memory
Prevents re-asking for: name, phone, email, address, service, preferred time. Uses `memory.progress` flags as the single source of truth.

### Blueprint
Validates CTA is legal for the current stage. Prevents booking before service is known. Booking stage requires name + contact.

### Objective
One question max per response. No mixing of booking + qualification + recommendation in the same message.

### Repetition
Checks last 4 assistant messages for exact duplicates or Jaccard similarity ≥ 72%.

### Tone
Per-industry tone validation. Examples:
- HVAC/Plumbing → Friendly, Professional, Dispatcher, Urgent
- Roofing → Confident, Professional, Consultative
- SaaS → Consultative, Professional, Educational
- Dispatcher tone → no hedging language ("I think", "maybe")
- Professional tone → no casual slang ("lol", "omg")

### Urgency
Critical/emergency urgency → response must acknowledge urgency, must not ask low-priority questions, must not be generic marketing.

### Booking
Validates: permission enabled, service identified, contact present, no weekend offers if weekend booking disabled.

### Business Rules
- Emergency dispatch only if `emergencyPolicy.enabled`
- No immediate availability offers when business is closed (injectable `nowMs`)
- No out-of-service-area city references

### Hallucination
Blocks: specific prices, discounts, percentage-off, "money-back guarantee", "100% satisfaction", warranty claims, named technicians, pre-confirmed appointments.

### Response Quality (North Star)
Response must satisfy at least one:
1. Helps the customer
2. Helps the business
3. Moves the conversation forward

## Performance

All validation is synchronous. No DB. No network.

Target: p50 < 5 ms, p95 < 15 ms (validated in tests).

## Tests

```
src/validation-engine/__tests__/validation-engine.test.ts
  95 tests across 20 suites
```

Covers every validator, fallback, industry tone, booking scenario, hallucination pattern, and pipeline integration.
