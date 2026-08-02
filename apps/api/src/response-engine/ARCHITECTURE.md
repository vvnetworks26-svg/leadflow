# Response Engine — Architecture (Layer 4)

## Overview

Layer 4 receives conversation state and produces a structured **ResponseBlueprint** — a set of instructions that tells any LLM (or any response generator) what to communicate without prescribing exact wording.

**The Response Engine never generates text. It decides what to say. Gemini decides how to say it.**

This separation means:
- The business logic is deterministic and testable without an LLM
- Any LLM can be swapped in without touching orchestration logic
- The same blueprint drives chat, voice, SMS, or email

---

## Data Flow

```
ResponseEngineInput
  ├── ConversationPlan   (Layer 3 — objective, priority, requiredField)
  ├── BusinessIdentity  (Layer 1 — brand tone, industry, rules)
  ├── ConversationStage (ai/types — legacy stage for backward compat)
  ├── RichConversationMemory
  ├── ResolvedIntent    (Layer 2 — urgency, category, requiresHuman)
  ├── QualificationScore
  ├── Recommendations[]
  └── WorkflowState     (Layer 3)
        ↓
  ResponseEngine.buildBlueprint()
        ↓
  ┌─ ToneEngine      → Tone
  ├─ EmotionEngine   → Emotion
  ├─ LengthEngine    → ResponseLength
  ├─ CTAEngine       → CTAType
  ├─ Personalization → { visitorName, company, service }
  ├─ ResponsePlanner → ResponseStyle + guardrails + examples
  └─ Humanizer       → question + mustMention + mustAvoid
        ↓
  ResponseBlueprint (frozen, immutable)
        ↓
  Gemini / LLM → Natural language response
```

---

## Module Responsibilities

| Module | File | Single Responsibility |
|---|---|---|
| **ResponseEngine** | `ResponseEngine.ts` | Orchestrates all sub-engines, single entry point |
| **ResponseTone** | `ResponseTone.ts` | Tone selection: urgency > workflow > objective > brand > industry |
| **ResponseEmotion** | `ResponseEmotion.ts` | Emotion selection based on booking status, stage, urgency |
| **ResponseLength** | `ResponseLength.ts` | Length selection: emergency=one sentence, collection=short, etc. |
| **CTAEngine** | `CTAEngine.ts` | CTA selection: what action should follow the response |
| **Personalization** | `Personalization.ts` | Extracts name/company/service from memory (never invents) |
| **ResponsePlanner** | `ResponsePlanner.ts` | Style, guardrails, examples |
| **Humanizer** | `Humanizer.ts` | Field question variants, mustMention/mustAvoid builders, phrase transforms |
| **ResponseBlueprint** | `ResponseBlueprint.ts` | Immutable blueprint factory |

---

## Tone Priority

Rules are evaluated in strict priority order — highest wins:

```
1. urgency === 'critical'                  → Dispatcher
2. urgency === 'emergency'                 → Urgent
3. workflowState === 'emergency_dispatch'  → Dispatcher
4. workflowState === 'escalating'          → Calm
5. Objective override (recommendation→Consultative, FAQ→Educational, etc.)
6. Brand personality (friendly→Friendly, professional→Professional)
7. Industry default (saas→Consultative, electrical→Professional, etc.)
8. Fallback                                → Friendly
```

---

## Public API

```typescript
// Primary entry point — the only function the orchestrator calls
ResponseEngine.buildBlueprint(input: ResponseEngineInput): ResponseBlueprint

// Sub-engines (for testing / advanced use)
selectTone(params)         → Tone
selectEmotion(params)      → Emotion
selectLength(params)       → ResponseLength
selectCTA(params)          → CTAType
buildPersonalization(mem)  → { visitorName?, company?, service? }
selectStyle(params)        → ResponseStyle
buildGuardrails(params)    → string[]
buildExamples(params)      → string[]
humanize(text)             → string          // robotic → natural
humanizeFieldQuestion(field, index) → string  // field name → question variant
buildMustMention(params)   → string[]
buildMustAvoid(params)     → string[]
```

---

## Integration Plan

**Current orchestrator** (`ai/orchestrator.ts`) calls `buildFallbackReply()` when Gemini is unavailable. To adopt Layer 4:

```typescript
// Before (step 10 in orchestrator.ts):
reply = buildFallbackReply(nextStage, updatedMemory, orgContext, plan);

// After (Layer 4 integration):
const blueprint = ResponseEngine.buildBlueprint({
  plan,           // Layer 3 ConversationPlan
  identity,       // Layer 1 BusinessIdentity
  stage:          nextStage,
  memory:         richMemory,
  intent,         // Layer 2 ResolvedIntent
  qualification,
  recommendations,
  workflowState:  nextState,
});
reply = await gemini.generateFromBlueprint(blueprint);
// Fallback: blueprint.question ?? blueprint.examples[0] ?? ''
```

No other changes to existing business logic are required.

---

## Extension Points

**Adding a new Tone:** Add to the `Tone` union in `types.ts`, add a rule in `ResponseTone.ts`.

**Adding a new CTA:** Add to `CTAType` union in `types.ts`, add a case in `CTAEngine.ts`.

**Adding a new industry style:** Add to `INDUSTRY_STYLE` in `ResponsePlanner.ts`.

**Adding new mustAvoid rules:** Add to `objectiveAvoid` in `Humanizer.ts`.

**Changing tone priority:** Adjust the priority rules in `ResponseTone.ts` — no other file changes needed.

---

## Design Decisions

1. **No classes, no singletons** — every module exports pure functions. Zero global state.
2. **No LLM dependency** — the engine is fully deterministic and testable offline.
3. **Priority cascade for tone/emotion/CTA** — urgency always overrides brand, brand overrides industry. One clear winner, no ambiguity.
4. **Personalization is null-safe** — never invents values, always returns `undefined` for missing data.
5. **Guardrails are structural** — they are strings Gemini reads as constraints, not runtime checks.
6. **Frozen output** — `ResponseBlueprint` is `Object.freeze()`'d at construction, preventing accidental mutation downstream.

---

## File Structure

```
src/response-engine/
├── ARCHITECTURE.md
├── index.ts              ← public API barrel
├── types.ts              ← all domain types and enums
├── ResponseEngine.ts     ← single entry point: buildBlueprint()
├── ResponseTone.ts       ← deterministic tone selection
├── ResponseEmotion.ts    ← deterministic emotion selection
├── ResponseLength.ts     ← deterministic length selection
├── CTAEngine.ts          ← deterministic CTA selection
├── Personalization.ts    ← memory → personalization fields
├── ResponsePlanner.ts    ← style, guardrails, examples
├── Humanizer.ts          ← field questions, phrase transforms, mustMention/Avoid
├── ResponseBlueprint.ts  ← immutable blueprint factory
└── __tests__/
    └── response-engine.test.ts  ← 75 unit tests
```
