# Conversation Orchestration Engine — Architecture (Layer 3)

## Overview

Layer 3 is the **workflow brain** of LeadFlow OS.

Every conversation turn it answers one question:
**What is the next business objective?**

It never generates language. It never calls an LLM. It never mutates memory.
Its only output is a deterministic, immutable `ConversationPlan` that Layer 6
(Response Engine) will later express in natural language.

This design means the same orchestration engine can drive chat, voice, SMS,
WhatsApp, or email without changing a single line of core logic.

---

## Orchestration Pipeline

```mermaid
sequenceDiagram
    participant CE  as Conversation Engine
    participant ORC as ConversationOrchestrationService
    participant BL  as BlueprintLoader
    participant RE  as RuleEngine
    participant SE  as StateEvaluator
    participant RM  as RecoveryManager
    participant OS  as ObjectiveSelector
    participant PB  as ConversationPlanBuilder

    CE->>ORC: orchestrate(OrchestrationInput)

    ORC->>BL: loadBlueprint(id, industry, intent)
    BL-->>ORC: ConversationBlueprint | null

    ORC->>RE: evaluateRules(context)
    RE-->>ORC: RuleResult

    alt Rule fired
        ORC->>PB: buildConversationPlan(ruleObjective)
        PB-->>ORC: ConversationPlan
        ORC-->>CE: OrchestrationResult (short-circuit)
    end

    ORC->>SE: evaluateState(memory, blueprint, urgency)
    SE-->>ORC: WorkflowState

    ORC->>RM: detectRecoverySignal(message, intent, strategy)
    RM-->>ORC: RecoveryResult

    ORC->>OS: selectObjective(blueprint, progress, state)
    OS-->>ORC: ConversationObjective

    ORC->>PB: buildConversationPlan(objective, state, blueprint)
    PB-->>ORC: ConversationPlan (frozen)

    ORC-->>CE: OrchestrationResult
```

---

## Module Responsibilities

| Module | File | Single Responsibility |
|---|---|---|
| **ConversationOrchestrationService** | `ConversationOrchestrationService.ts` | Coordinates all modules — single entry point |
| **BlueprintLoader** | `modules/blueprint-loader.ts` | Resolves blueprint: cache → repo → null |
| **RuleEngine** | `modules/rule-engine.ts` | Evaluates business rules; highest-priority override wins |
| **StateEvaluator** | `modules/state-evaluator.ts` | Derives WorkflowState from inputs — never mutates |
| **RecoveryManager** | `modules/recovery-manager.ts` | Detects topic change, correction, dont_know, already_answered |
| **ObjectiveSelector** | `modules/objective-selector.ts` | Walks blueprint stages in order; returns first incomplete objective |
| **CompletionEvaluator** | `modules/completion-evaluator.ts` | Determines if an objective is complete from memory/progress |
| **ConversationPlanBuilder** | `modules/conversation-plan-builder.ts` | Assembles frozen ConversationPlan |
| **InMemoryBlueprintRepository** | `repository/InMemoryBlueprintRepository.ts` | Default static blueprints, Zod-validated |
| **BlueprintCache** | `cache/BlueprintCache.ts` | TTL + LRU in-process cache |

---

## Domain Model

```mermaid
classDiagram
    class ConversationOrchestrationService {
        +orchestrate(input) OrchestrationResult
        +loadBlueprint(id, industry, intent) Blueprint|null
        +evaluateState(input) WorkflowState
        +selectObjective(input) ConversationObjective
        +buildConversationPlan(input) ConversationPlan
        +invalidateBlueprintCache(id?) void
    }

    class ConversationBlueprint {
        +id: string
        +industry: string
        +intentCategory: string
        +stages: BlueprintStage[]
        +rules: BusinessRule[]
        +branches: BranchDefinition[]
    }

    class BlueprintStage {
        +id: string
        +objective: ConversationObjective
        +completionCriteria: string[]
        +skipWhen: string[]
        +allowedTools: AllowedTool[]
        +transitions: BlueprintTransition[]
        +recoveryStrategy: RecoveryStrategy
    }

    class ConversationPlan {
        +objective: ConversationObjective
        +reason: string
        +requiredField: string|null
        +questionType: QuestionType
        +priority: critical|high|medium|low
        +allowedTools: AllowedTool[]
        +nextState: WorkflowState
        +completionCriteria: string[]
        +isTerminal: boolean
        +blueprintId: string|null
        +ruleApplied: string|null
    }

    ConversationOrchestrationService --> ConversationBlueprint
    ConversationBlueprint "1" --> "*" BlueprintStage
    ConversationOrchestrationService --> ConversationPlan
```

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> initialising
    initialising --> collecting_info : blueprint loaded, no terminal rule
    initialising --> emergency_dispatch : urgency critical/emergency
    initialising --> escalating : requiresHuman OR human intent
    collecting_info --> booking_in_progress : all required fields collected
    collecting_info --> objection_handling : objection detected
    collecting_info --> emergency_dispatch : urgency escalates
    collecting_info --> escalating : customer requests human
    booking_in_progress --> awaiting_confirmation : appointment offered
    awaiting_confirmation --> completed : booking confirmed
    objection_handling --> collecting_info : objection resolved
    objection_handling --> escalating : unresolvable
    emergency_dispatch --> completed : emergency booked
    emergency_dispatch --> escalating : critical + no availability
    escalating --> completed
    completed --> [*]
```

---

## Blueprint Selection Flow

```mermaid
flowchart TD
    A[intent.blueprintId provided?] -- Yes --> B[Load by ID from cache/repo]
    A -- No --> C[findByIndustryAndIntent]
    C --> D{Exact industry match?}
    D -- Yes --> E[Return industry-specific blueprint]
    D -- No --> F{Wildcard '*' match?}
    F -- Yes --> G[Return generic blueprint]
    F -- No --> H[Return null → safe defaults]
    B --> I[Return blueprint]
    E --> I
    G --> I
```

---

## Rule Priority System

Rules are evaluated in descending priority order. The first rule that fires
short-circuits all remaining logic and returns immediately.

| Priority | Rule | Trigger | Action |
|---|---|---|---|
| 100 | Emergency critical | `urgency === critical` | Skip to emergency booking |
| 95 | Human representative | `requiresHuman or intent=human_representative` | Escalate immediately |
| 90 | Emergency urgency | `urgency === emergency` | Skip to emergency booking |
| 85 | Complaint | `intent === complaint` | Escalate immediately |
| 80 | Business closed | `!isOpen(businessHours)` | Offer next available slot |
| 70 | Billing | `intent === billing_question` | Set billing objective |

Rules are defined in blueprint configuration — never hardcoded in engine logic.

---

## Recovery Scenarios

| Signal | Detection | Action |
|---|---|---|
| `already_answered` | "I already told you / I already said" | Stay on current objective |
| `dont_know` | "I don't know / not sure" | Switch to `clarify_intent` |
| `correction` | "Actually / wait / no, I meant" | Stay on objective to re-collect |
| `topic_change` | High-priority intent shift (billing, complaint, human) | Switch to mapped objective |
| `none` | Normal reply | Continue with selected objective |

Recovery preserves context whenever possible. The conversation never restarts
unless a business rule explicitly demands it.

---

## Extending for a New Industry

1. Add blueprint data to `blueprints/default-blueprints.ts` (or store in DB)
2. No engine code changes needed

## Extending with a New Business Rule

1. Add the `RuleTrigger` to `types.ts` and `schemas.ts`
2. Add the trigger test to `modules/rule-engine.ts` `testTrigger()`
3. Add the rule to the blueprint configuration

## Extending with a New Objective

1. Add to `ConversationObjective` union in `types.ts` and `schemas.ts`
2. Add to `OBJECTIVE_FIELDS` / `OBJECTIVE_QUESTION_TYPE` in `conversation-plan-builder.ts`
3. Add to `isObjectiveComplete()` in `completion-evaluator.ts`

---

## File Structure

```
src/conversation-engine/
├── ARCHITECTURE.md
├── index.ts                          ← public API barrel
├── types.ts                          ← all domain types and enums
├── schemas.ts                        ← Zod validation schemas
├── ConversationOrchestrationService.ts ← single entry point
├── blueprints/
│   └── default-blueprints.ts         ← HVAC, plumbing, generic blueprints
├── modules/
│   ├── blueprint-loader.ts
│   ├── rule-engine.ts
│   ├── state-evaluator.ts
│   ├── objective-selector.ts
│   ├── completion-evaluator.ts
│   ├── recovery-manager.ts
│   └── conversation-plan-builder.ts
├── repository/
│   ├── BlueprintRepository.ts        ← IBlueprintRepository interface
│   └── InMemoryBlueprintRepository.ts
├── cache/
│   └── BlueprintCache.ts             ← TTL + LRU cache
└── __tests__/
    └── conversation-engine.test.ts   ← 46 unit tests
```
