# Phase LF.2 — AI Conversation Engine 2.0
## Implementation Report

**Date:** July 8, 2026
**Status:** ✅ Complete
**Build:** ✅ Zero TypeScript errors — clean production build
**Tests:** ✅ 61/61 smoke tests passed

---

## Executive Summary

LeadFlow now has a full AI Sales Development Representative engine. Every conversation is handled by a multi-stage orchestrator that classifies intent, tracks context across turns, qualifies leads, generates targeted recommendations, handles objections, and transitions naturally into appointment booking — all organisation-scoped and never leaking data between tenants.

Gemini is used purely as the LLM transport. All conversation logic lives in the orchestrator layer.

---

## Architecture

```
POST /ai/chat
     │
     ▼
aiController.ts           ← session load/save
     │
     ▼
orchestrator.ts           ← master flow controller
     ├── guardrails.ts    ← input check (prompt injection / harmful content)
     ├── intent.ts        ← intent classification (keyword scoring)
     ├── memory.ts        ← extract + merge signals from user message
     ├── tools.ts         ← auto-select + execute internal tools
     ├── knowledge.ts     ← semantic keyword search on KB
     ├── qualification.ts ← 10-dimension lead scoring
     ├── recommendation.ts← product matching with WHY explanations
     ├── conversation-state.ts ← state machine transitions
     ├── prompt-builder.ts← dynamic modular prompt assembly
     ├── gemini.ts        ← LLM transport (only file touching Google SDK)
     ├── guardrails.ts    ← output sanitization
     ├── summarizer.ts    ← structured summary generation
     └── analytics.ts     ← fire-and-forget event persistence
```

---

## Files Created

### `src/ai/` — 14 files

| File | Responsibility |
|------|---------------|
| `types.ts` | All shared AI types — single source of truth |
| `orchestrator.ts` | 15-step master flow controller |
| `gemini.ts` | Gemini LLM transport — only file touching Google AI SDK |
| `memory.ts` | Structured memory: extract, merge, serialize to prompt |
| `intent.ts` | Intent classification: 14 types, confidence 0–100 |
| `qualification.ts` | 10-dimension lead scoring with temperature (Hot/Warm/Cold/Disqualified) |
| `recommendation.ts` | Product recommendation engine with per-lead WHY explanations |
| `conversation-state.ts` | 8-stage state machine with automatic transitions |
| `prompt-builder.ts` | Dynamic modular prompt assembly (9 blocks, no static giants) |
| `knowledge.ts` | Searchable knowledge base: 17 entries across 8 categories |
| `tools.ts` | 12 internal tools with typed responses + auto-selection |
| `guardrails.ts` | Pre/post generation safety: injection, hallucination, human claims |
| `summarizer.ts` | Structured conversation summary with next-action logic |
| `analytics.ts` | AIAnalytics Mongoose model + stats aggregation |

### New model + controller + routes

| File | Responsibility |
|------|---------------|
| `src/models/AIConversationSession.model.ts` | Persists stage, memory, history between turns (TTL 90d) |
| `src/controllers/aiController.ts` | All AI endpoint handlers |
| `src/routes/ai.routes.ts` | AI route definitions with rate limiting |

### Modified

| File | Change |
|------|--------|
| `src/config/env.ts` | Added `GEMINI_API_KEY` (optional) |
| `src/config/database.ts` | Registered `AIConversationSession` and `AIAnalytics` models |
| `src/routes/index.ts` | Mounted `/ai` routes |
| `src/routes/widget.routes.ts` | Added `POST /:token/chat` widget AI endpoint |
| `src/controllers/widgetController.ts` | Added `widgetChat` handler |
| `apps/api/.env.example` | Added `GEMINI_API_KEY=` |

---

## Per-Turn Orchestrator Flow (15 steps)

```
1.  Input guardrail check      → block injection / harmful content
2.  Intent classification      → 14 intents, confidence score
3.  Memory update              → extract name, company, budget, timeline, phone, email,
                                  pain points, goals, objections from user message
4.  Tool auto-selection        → decide which tools to call based on message + stage
5.  Tool execution             → lookupPricing, lookupFAQ, lookupAvailability, etc.
6.  Knowledge retrieval        → top-3 KB entries matching the user's message
7.  Qualification scoring      → 10-dimension weighted score (0–100) + temperature
8.  Recommendation generation  → top-3 product fits with WHY per lead
9.  State machine transition   → automatic stage advancement
10. Prompt assembly            → 9-block dynamic system prompt
11. Gemini call                → with full history + system context
12. Output guardrail check     → sanitize hallucinated prices, human claims, bad integrations
13. Memory update from reply   → track services mentioned by AI
14. Booking detection          → trigger booking when score ≥ 60 + intent
15. Analytics events           → fire-and-forget to AIAnalytics collection
```

---

## Conversation Stage Machine

```
greeting → discovery → qualification → recommendation → booking → completed
                    ↘                ↘               ↗
                   objection ────────────────────────
                        ↘
                      escalated
```

Transitions are **automatic** — no client needs to manage stage. The orchestrator reads intent + score + memory on every turn and advances the stage when conditions are met.

---

## Intent Types (14)

`Greeting` · `Question` · `Pricing` · `Feature` · `LeadFlow` · `Website` · `Automation` · `Support` · `Technical` · `Booking` · `Demo` · `Objection` · `Comparison` · `Unknown`

---

## Qualification Dimensions (10)

| Dimension | Weight |
|-----------|--------|
| Buying intent | 15% |
| Decision maker | 12% |
| Budget | 12% |
| Pain severity | 12% |
| Timeline | 10% |
| Urgency | 10% |
| Company size | 8% |
| Industry | 7% |
| Technical readiness | 7% |
| AI readiness | 7% |

**Temperature thresholds:** Hot ≥ 75 · Warm ≥ 55 · Cold ≥ 30 · Disqualified < 30

---

## Conversation Memory — Fields Tracked

| Field | Extraction Method |
|-------|------------------|
| `visitorName` | "I'm X", "my name is X", "this is X" patterns |
| `company` | "from X", "at X", "working at X" patterns |
| `phone` | NANP phone regex |
| `email` | RFC 5322 email regex |
| `budget` | `$X`, `Xk dollars`, qualitative keywords |
| `timeline` | ASAP/this week/this month/30 days/Q1/etc. |
| `employeeCount` | "X employees/people/staff" patterns |
| `decisionMaker` | "I decide", "I'm the CEO/owner", "my decision" |
| `painPoints` | 22 pain signal keywords → sentence extraction |
| `goals` | 11 goal keywords → sentence extraction |
| `objections` | 15 objection phrases |
| `servicesDiscussed` | Populated from recommendations shown |
| `questionsAnswered` | AI questions → user responses tracked |
| `bookingStatus` | `none` → `requested` → `booked` |

Memory is **never reset** within a session. The AI will never ask for information already collected.

---

## Tools (12)

| Tool | Trigger |
|------|---------|
| `lookupBusiness` | Called by orchestrator to load org context |
| `lookupServices` | Auto: `recommendation` stage |
| `lookupPricing` | Auto: price/cost keywords in message |
| `lookupFAQ` | Auto: question keywords |
| `lookupCaseStudies` | Auto: "case study", "example", "client" |
| `lookupIntegrations` | Auto: "integrate", "connect", "API", "webhook" |
| `lookupAvailability` | Auto: `booking` stage or booking intent |
| `bookAppointment` | Manual: called when booking is confirmed |
| `createLead` | Manual: creates CRM lead from session memory |
| `updateLead` | Manual: updates existing lead record |
| `searchKnowledge` | Manual: general knowledge lookup |
| `summarizeConversation` | Manual: generates summary from memory |

---

## Guardrails

**Input (pre-LLM):**
- 9 prompt injection patterns blocked (ignore instructions, pretend, act as, DAN, etc.)
- 5 harmful content patterns blocked (weapons, self-harm, CSAM, drugs, trafficking)

**Output (post-LLM):**
- Human identity claims sanitized
- Hallucinated integration names softened
- Suspiciously specific fabricated prices replaced with "contact us"
- Known valid integrations whitelist enforced

**Fallback:** If Gemini is unavailable (no API key or error), the orchestrator returns intelligent rule-based responses per stage — the system never goes silent.

---

## Knowledge Base (17 entries, 8 categories)

| Category | Entries |
|----------|---------|
| Services | 5 (LeadFlow, WebsiteAutomation, AIAgent, CRMIntegration, CustomSoftware) |
| Pricing | 2 (SaaS plans, professional services) |
| FAQ | 4 (setup, trial, data security, cancellation) |
| Integrations | 3 (CRM, Calendar, Zapier/Make) |
| CaseStudies | 2 (HVAC 3×, Agency 10×) |
| Policies | 2 (Refund, SLA) |
| Technical | 2 (REST API, Webhooks) |

Organisation-specific FAQ entries from `Business.aiConfig.faq` are overlaid on top of the defaults per request.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/ai/chat` | JWT | Main conversation turn |
| POST | `/api/v1/ai/intent` | JWT | Standalone intent detection |
| POST | `/api/v1/ai/qualify` | JWT | Standalone qualification |
| GET | `/api/v1/ai/recommendations/:id` | JWT | Get recs for session |
| POST | `/api/v1/ai/summary` | JWT | Generate conversation summary |
| GET | `/api/v1/ai/analytics` | JWT (manager+) | AI performance stats |
| GET | `/api/v1/ai/session/:id` | JWT | Get session state |
| POST | `/api/v1/widget/:token/chat` | None | Widget AI (org from token) |

---

## Analytics Events Tracked

`message_received` · `intent_classified` · `stage_transition` · `lead_qualified` · `recommendation_shown` · `booking_triggered` · `tool_called` · `conversation_summarized` · `guardrail_blocked` · `conversation_dropped`

**Aggregated stats available via `/ai/analytics`:**
- Intent distribution
- Average lead score
- Booking rate (bookings / unique conversations)
- Average conversation length
- Tool usage counts
- Recommendation acceptance rate
- Guardrail block count
- Drop-off by stage

---

## Multi-Tenant Guarantee

Every AI request receives `organizationId` from:
- JWT token (authenticated dashboard requests)
- Widget token → slug/ID → org lookup (unauthenticated widget requests)

`AIConversationSession` documents include `organizationId` as a required indexed field. All tool calls (`lookupBusiness`, `bookAppointment`, `createLead`, etc.) pass `organizationId` as the first argument. No AI request can read or write another organisation's data.

---

## Smoke Test Results

```
[1] Intent Classification      8/8  ✅
[2] Conversation Memory       13/13 ✅
[3] Lead Qualification         8/8  ✅
[4] Recommendation Engine      5/5  ✅
[5] Guardrails                 7/7  ✅
[6] Knowledge Base Search      5/5  ✅
[7] State Machine              3/3  ✅
[8] Summarizer                 6/6  ✅
[9] Prompt Builder             6/6  ✅
─────────────────────────────────────
Total: 61 passed, 0 failed ✅
```

---

## Acceptance Criteria

| Criteria | Status |
|----------|--------|
| ✅ Zero TypeScript errors | PASS |
| ✅ Clean production build | PASS |
| ✅ Dynamic prompt builder | PASS — 9 modular blocks assembled per turn |
| ✅ Context memory | PASS — 14 fields, never re-asks known info |
| ✅ Intent detection | PASS — 14 intents, confidence 0–100 |
| ✅ Qualification engine | PASS — 10 dimensions, weighted score, 4 temperatures |
| ✅ Tool calling architecture | PASS — 12 tools, typed responses, auto-selection |
| ✅ Recommendation engine | PASS — per-lead WHY, fitScore, industry/pain/goal matching |
| ✅ Conversation state machine | PASS — 8 stages, automatic transitions |
| ✅ Booking handoff | PASS — threshold detection + memory update + tool trigger |
| ✅ Knowledge search | PASS — 17 entries, 8 categories, org overlay |
| ✅ Conversation summaries | PASS — structured summary with next action |
| ✅ Analytics | PASS — 10 event types, 8 aggregated metrics |
| ✅ Multi-tenant support | PASS — orgId in every model, tool call, and session |
| ✅ Guardrails | PASS — 9 injection patterns, 5 harmful patterns, output sanitization |
