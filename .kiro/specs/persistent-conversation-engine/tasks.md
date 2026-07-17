# Implementation Plan: LeadFlow AI v2.1 Persistent Conversation Engine

## Overview

This plan implements the Persistent Conversation Engine across 10 sequential phases.
Each phase keeps the application fully functional — no phase introduces a breaking
change before the phase that fixes it is also complete. Backend phases (1–5) are
deployed first; frontend phases (6–9) follow. Tests (phase 10) run after every phase.

All 34 tasks map directly to requirements (REQ-1 through REQ-14) and the revised
design document (design.md sections 1–14).

## Tasks

> Tasks are ordered so the application remains functional after every phase.
> Each phase can be merged independently. Backend phases before frontend phases.
> Reference: requirements.md (REQ-1 through REQ-14) and design.md (sections 1–14).

---

## Phase 1 — Schema & Model Upgrade

- [ ] 1. **Upgrade `AIConversationSession` model** (`apps/api/src/models/AIConversationSession.model.ts`)
  - Add `widgetSessionId: { type: String, sparse: true }` — optional, no required constraint so existing docs remain valid
  - Add `seq: { type: Number, default: 0, required: true }` — optimistic concurrency token
  - Add `status: { type: String, enum: ['active','archived','booked'], default: 'active', index: true }`
  - Add `schemaVersion: { type: Number, default: 1 }` — for client-side cache busting
  - Replace `progress: Schema.Types.Mixed` with a typed sub-document schema containing all 11 boolean fields, each defaulting to `false`
  - Add compound index `{ widgetSessionId: 1, organizationId: 1 }` (sparse, unique)
  - Add compound index `{ status: 1, lastActivity: 1 }` — covers expiry job query
  - Retain all existing fields, existing TTL index, and existing indexes unchanged
  - Update `IAIConversationSession` interface to include the new fields
  - _Verifies: REQ-5.1, REQ-5.4, REQ-5.5, REQ-14.4, REQ-14.5_

- [ ] 2. **Extend `AIAnalyticsEventType`** (`apps/api/src/ai/types.ts`)
  - Add to the union: `'session_created' | 'session_resumed' | 'session_expired' | 'returning_visitor' | 'sessions_archived_batch' | 'sessions_deleted_batch' | 'session_booked'`
  - No other changes to types.ts
  - Run `npx tsc --noEmit` — zero errors required before proceeding
  - _Verifies: REQ-13_

---

## Phase 2 — Session API (Backend)

- [ ] 3. **Create `widgetCreateSession` controller** (`apps/api/src/controllers/widgetController.ts`)
  - Add handler for `POST /api/v1/widget/:token/session`
  - Reject requests whose body contains `widgetSessionId` or `conversationId` with HTTP 422 `VALIDATION_ERROR`
  - Resolve org via existing `resolveOrg(token)` — 404 on failure
  - Generate `widgetSessionId = randomUUID()` and `conversationId = randomUUID()` server-side
  - Create `AIConversationSession` with both IDs, `status: 'active'`, `seq: 0`, `schemaVersion: 1`
  - Return `{ widgetSessionId, schemaVersion: 1, stage: 'greeting', turnCount: 0 }` — never `conversationId` or `organizationId`
  - Emit `session_created` analytics event via `persistEvents()`
  - _Verifies: REQ-2, REQ-11.1, REQ-11.3, REQ-13.1_

- [ ] 4. **Create `widgetGetSession` controller**
  - Add handler for `GET /api/v1/widget/:token/session/:widgetSessionId`
  - Validate `:widgetSessionId` matches UUID v4 regex — return 422 `INVALID_SESSION_ID` before any DB query
  - Resolve org; query `{ widgetSessionId, organizationId }` using compound index
  - Return 404 `SESSION_NOT_FOUND` if document not found or org mismatch
  - Return 410 `SESSION_EXPIRED` if `lastActivity < now - 48h` — never return 410 for active sessions
  - Project hydration payload: `{ widgetSessionId, schemaVersion, stage, turnCount, lastActivity, isReturning, progress, history (last 20), displayName }`
  - `displayName` = `session.memory?.visitorName ?? null` — the only memory field exposed
  - `isReturning` = `session.turnCount > 0`
  - Never include `conversationId`, `organizationId`, `_id`, `memory` blob, `qualification`, or `rich` fields
  - Emit `session_resumed` event if `turnCount > 0`
  - _Verifies: REQ-3, REQ-11.2, REQ-11.3, REQ-11.4, REQ-11.5, REQ-13.2_

- [ ] 5. **Create `widgetDeleteSession` controller**
  - Add handler for `DELETE /api/v1/widget/:token/session/:widgetSessionId`
  - Validate UUID format (422), resolve org (404), check session exists and belongs to org (404)
  - If not found/wrong org: 404 `SESSION_NOT_FOUND`
  - `findOneAndUpdate({ widgetSessionId, organizationId, status: { $ne: 'archived' } }, { $set: { status: 'archived' } })`
  - If DB write fails: 500 `INTERNAL_ERROR`
  - Return 200 `{ status: 'ok' }`
  - _Verifies: REQ-4_

- [ ] 6. **Redesign rate limiting in `widget.routes.ts`**
  - Remove `router.use(widgetLimiter)` blanket
  - Create independent `rateLimit()` instances for each route family:
    - `sessionCreateLimiter`: `{ windowMs: 60_000, max: 10, keyGenerator: (req) => req.ip + '::' + req.params.token }`
    - `sessionReadLimiter`: `{ windowMs: 15*60_000, max: 30, keyGenerator: ... }`
    - `chatLimiter`: `{ windowMs: 15*60_000, max: 40, keyGenerator: ... }`
    - `bookLimiter`: `{ windowMs: 15*60_000, max: 5, keyGenerator: ... }`
    - `configLimiter`: `{ windowMs: 15*60_000, max: 120, keyGenerator: ... }`
    - `defaultLimiter`: `{ windowMs: 15*60_000, max: 20, keyGenerator: ... }` — for leads/conversations
  - Apply each limiter directly to its route(s): `router.post('/:token/session', sessionCreateLimiter, widgetCreateSession)`
  - Register the three new session routes: POST, GET, DELETE
  - _Verifies: REQ-2.5, REQ-2.6, REQ-2.7, design §8_

---

## Phase 3 — Chat Endpoint Upgrade (Backend)

- [ ] 7. **Update `widgetChat` to accept `widgetSessionId` + `messageType`**
  - Accept new optional fields in request body: `widgetSessionId?: string`, `messageType?: 'greeting' | 'resume' | 'message'`
  - Backward compat: when `widgetSessionId` absent, fall back to existing `conversationId` lookup path — no change to existing behavior
  - When `widgetSessionId` present: look up session via `{ widgetSessionId, organizationId }` compound index
  - Map `messageType` → existing sentinel handling:
    - `'greeting'` → same as `message === '__init__'` (was: treat as "Hello", skip user history entry)
    - `'resume'` → new: treat as greeting but with existing memory context; inject "resume" intent into orchestrator
    - `'message'` → normal turn (default when `messageType` absent)
  - Keep `__init__` string detection for backward compat (`isInit = message.trim() === '__init__' || messageType === 'greeting'`)
  - _Verifies: REQ-7.3, REQ-14.2, design §3.4_

- [ ] 8. **Implement optimistic CAS (compare-and-swap) in `widgetChat`**
  - Read session once to get `{ seq, memory, history, stage }`
  - Run orchestrator (unchanged)
  - Replace `findByIdAndUpdate` with `findOneAndUpdate({ _id, seq: readSeq }, { $set: ..., $inc: { seq: 1, turnCount: 1 } }, { new: true })`
  - If result is `null` (CAS failed): return HTTP 409 `{ status: 'error', code: 'CONCURRENT_TURN' }`
  - Update `lastActivity: new Date()` in the same write
  - Remove the separate `findByIdAndUpdate` call — the CAS write replaces it entirely
  - _Verifies: design §2 (race condition elimination)_

- [ ] 9. **Handle `__resume__` in the orchestrator** (`apps/api/src/controllers/widgetController.ts` + `apps/api/src/ai/orchestrator.ts`)
  - In `widgetChat`: when `messageType === 'resume'`, set `userMessage = '__resume__'`
  - In `runOrchestrator`: detect `userMessage === '__resume__'`; build resumption prompt using existing memory
  - If `memory.visitorName` is non-null: personalized greeting referencing name + last service
  - If `memory.visitorName` is null: generic "Welcome back" greeting
  - Emit `returning_visitor` analytics event when `memory.visitorName` is non-null
  - Do not store `__resume__` as a user history entry (same as `__init__`)
  - _Verifies: REQ-7.4, REQ-7.5, REQ-13.4_

- [ ] 10. **Run `npx tsc --noEmit` on backend** — zero errors required before Phase 4

---

## Phase 4 — CRM Memory Enrichment (Backend)

- [ ] 11. **Add fire-and-forget memory enrichment to `widgetBook`**
  - After `res.status(201).json(...)` is called, start non-blocking enrichment
  - Look up `AIConversationSession` by `widgetSessionId` (preferred) or `conversationId` (fallback)
  - If not found: `logger.warn('[widgetBook] No AI session for enrichment, conversationId: ...')` — continue, no error
  - Build `enrichmentPatch` via `buildEnrichmentPatch(formData, session.memory)`:
    - Only fill Lead fields that are empty/falsy in formData
    - `visitorName → lead.name`, `phone → lead.phone`, `rich.address.value → lead.address`, `rich.zip.value → lead.zipCode`, `rich.service.value → lead.hvacNeed`, `rich.emergency.value → lead.emergency`
    - `memory.summary` appended to `lead.notes` with `---` separator
  - `LeadService.update(orgId, leadId, enrichmentPatch)` — if patch is empty, skip
  - `AIConversationSessionModel.findOneAndUpdate({ widgetSessionId, seq: session.seq }, { $set: { status: 'booked' }, $inc: { seq: 1 } })` — CAS to mark booked
  - Emit `session_booked` analytics event
  - The entire enrichment block is wrapped in `Promise.resolve().then(async () => { ... }).catch(() => {})` — never throws to caller
  - Accept `widgetSessionId` in `WidgetBookSchema` (optional string) alongside existing `conversationId`
  - _Verifies: REQ-9, REQ-5.6_

- [ ] 12. **Run `npx tsc --noEmit` on backend** — zero errors required before Phase 5

---

## Phase 5 — Session Expiry Job (Backend)

- [ ] 13. **Create `SessionExpiryJob`** (`apps/api/src/ai/session-expiry/SessionExpiryJob.ts`)
  - `archiveStale()`: `updateMany({ status: 'active', lastActivity: { $lt: cutoff48h } }, { $set: { status: 'archived' } })`
  - Emit `sessions_archived_batch` analytics event with `{ count, before: cutoff48h.toISOString() }`
  - `deleteOld()`: paginated loop — `find({ status: 'archived', lastActivity: { $lt: cutoff30d } }).limit(500)`, then `deleteMany({ _id: { $in: ids } })`, emit `sessions_deleted_batch`, repeat until empty
  - Never touch documents with `status: 'booked'` (query filters exclude them)
  - Each pass wrapped in `try/catch`; errors logged, not rethrown
  - Export `startSessionExpiryJob(intervalMinutes = 60)` using `node-cron` schedule
  - _Verifies: REQ-10, REQ-13.3_

- [ ] 14. **Wire `SessionExpiryJob` into server startup** (`apps/api/src/server.ts`)
  - Import and call `startSessionExpiryJob()` alongside `ReminderService.startCronJob()` and `WorkflowScheduler.startCronJobs()`
  - Log `[SessionExpiry] Cron job started` at INFO level

- [ ] 15. **Run `npx tsc --noEmit` + existing backend tests** — zero errors, all tests pass

---

## Phase 6 — Frontend: Session Storage Utility

- [ ] 16. **Create `widgetSession.ts`** (`src/services/widget/widgetSession.ts`)
  - Define `WidgetSessionStorage` interface: `{ widgetSessionId, orgSlug, schemaVersion, lastSeen }`
  - `STORAGE_KEY = (orgSlug: string) => 'lf_ws_' + orgSlug`
  - `read(orgSlug)`: parse and return stored object, or `null` on any error
  - `write(orgSlug, data)`: try `localStorage.setItem`; on `QuotaExceededError`, set `_inMemoryMode = true`, store in module-level Map, log warning
  - `clear(orgSlug)`: remove from localStorage and in-memory store
  - `isInMemoryMode`: getter returning `_inMemoryMode` boolean
  - Module-level `_inMemoryFallback: Map<string, WidgetSessionStorage>` for fallback storage
  - Export all functions as named exports (no class)
  - _Verifies: REQ-1.2, REQ-1.4, REQ-1.5, REQ-12.3_

- [ ] 17. **Run `npm run lint` (frontend TypeScript)** — zero errors

---

## Phase 7 — Frontend: `widgetApiClient` Updates

- [ ] 18. **Add session API methods to `widgetApiClient.ts`**
  - `createSession()`: `POST /:token/session` → returns `{ widgetSessionId, schemaVersion, stage, turnCount }`
  - `getSession(widgetSessionId)`: `GET /:token/session/:id` → returns hydration payload or throws with `.status` on 404/410/422
  - `deleteSession(widgetSessionId)`: `DELETE /:token/session/:id` → fire-and-forget safe (caller ignores errors)

- [ ] 19. **Update `widgetApiClient.chat()`**
  - Accept `widgetSessionId: string` and `messageType: 'greeting' | 'resume' | 'message'` in params
  - Send them in request body alongside `message` and `currentPage`
  - Keep `conversationId` param as optional for backward compat — omit from body when absent
  - Return type unchanged: `{ reply, stage, bookingTriggered }`
  - Handle 409 `CONCURRENT_TURN` — surface as a typed error the hook can retry

- [ ] 20. **Update `widgetApiClient.book()`**
  - Accept optional `widgetSessionId: string` alongside existing `conversationId`
  - Send it in request body when present
  - _Verifies: REQ-14.3_

- [ ] 21. **Run `npm run lint`** — zero errors

---

## Phase 8 — Frontend: `useConversation` Refactor

- [ ] 22. **Add `hydrationPhase` to `ChatState`** (`src/types/index.ts`)
  - Add `hydrationPhase: 'idle' | 'loading' | 'hydrated' | 'fresh' | 'recovering'` to `ChatState`
  - Update `INITIAL_STATE` in `useConversation.ts` to set `hydrationPhase: 'idle'`

- [ ] 23. **Implement session lifecycle in `initConversation()`** (`src/hooks/useConversation.ts`)
  - Read session from `widgetSession.read(orgSlug)` — `orgSlug` comes from `widgetApiClient.getToken()`
  - **Path A — session found, schemaVersion matches:**
    1. Set `hydrationPhase: 'loading'`
    2. Call `widgetApiClient.getSession(widgetSessionId)`
    3. On 200: call `hydrateConversation(data)`, set `hydrationPhase: 'hydrated'`, send `messageType: 'resume'`
    4. On 404/410: `widgetSession.clear()`, fall through to Path B
    5. On 5xx: set `hydrationPhase: 'recovering'`, show recovery greeting — do NOT clear storage
  - **Path B — no session or schemaVersion mismatch:**
    1. Call `widgetApiClient.createSession()`
    2. `widgetSession.write(orgSlug, { widgetSessionId, orgSlug, schemaVersion, lastSeen })`
    3. Set `hydrationPhase: 'fresh'`, send `messageType: 'greeting'`
  - Idempotent via `greetingFiredRef` (existing guard)
  - _Verifies: REQ-6, REQ-7.3, REQ-10 (client side), REQ-12.1_

- [ ] 24. **Implement `hydrateConversation()`**
  - Accept `{ history, stage, progress, displayName, isReturning, turnCount }` from GET /session response
  - Convert `history` entries to `ChatMessage[]` with synthetic timestamps (prior messages)
  - Set `state.messages = hydratedMessages`, `state.stage = stage`, `state.conversationId = null` (not needed client-side)
  - If `isReturning && displayName`: prepend a visual indicator message `"Continuing your conversation, {displayName}…"` as a UI-only AI bubble (not sent to backend)

- [ ] 25. **Implement `resetConversation()` as write-new-before-discard**
  - Call `widgetApiClient.createSession()` first
  - On success: `widgetSession.write(orgSlug, newSession)`, reset React state, call `deleteSession(oldWidgetSessionId)` fire-and-forget
  - On API failure: surface error in state, leave current session unchanged (do NOT clear storage)
  - _Verifies: REQ-8.5, design §7_

- [ ] 26. **Expose new methods from `useConversation`**
  - Return `createSession`, `loadSession`, `resumeSession`, `hydrateConversation` in addition to existing API
  - `sendMessage`, `initConversation`, `resetConversation` signatures unchanged
  - _Verifies: REQ-8.1, REQ-8.4_

- [ ] 27. **Update `sendMessage()` to use `widgetSessionId`**
  - Replace `conversationId` with `widgetSessionId` in `widgetApiClient.chat()` call
  - Handle 409 `CONCURRENT_TURN`: wait 300ms + jitter (`Math.random() * 200`), retry once; on second failure, show inline error
  - _Verifies: design §2 (client-side retry)_

- [ ] 28. **Run `npm run lint`** — zero errors

---

## Phase 9 — Frontend: Hydration UI

- [ ] 29. **Add hydration loading state to `ChatWindow.tsx`**
  - When `state.hydrationPhase === 'loading'`: render a centered "Continuing your conversation…" indicator instead of the message list
  - Use existing `TypingIndicator` component or a simple skeleton — no new dependencies
  - When `hydrationPhase !== 'loading'`: render normally
  - No changes to other components
  - _Verifies: REQ-6.5, REQ-6.7_

- [ ] 30. **Run `npm run lint` + visual smoke test** — widget opens, creates session, chat works, refresh resumes

---

## Phase 10 — Tests

- [ ] 31. **Backend unit tests** (`apps/api/src/ai/__tests__/session.test.ts`)
  - Session creation: returns UUID v4, rejects body with widgetSessionId, org resolution
  - Session resume: hydration payload excludes PII, 410 on stale session, 404 on wrong org
  - CAS retry: simulate seq collision → 409; simulate second attempt with updated seq → 200
  - Memory enrichment: non-overwrite rule, missing session logs warning, patch is empty when form data complete
  - Expiry job: archives active+stale, deletes archived+old, never touches booked, batch size respected

- [ ] 32. **Frontend unit tests** (`src/services/widget/__tests__/widgetSession.test.ts`)
  - `read()` returns null when empty, parses valid session, handles JSON parse error
  - `write()` stores correctly, switches to memory on QuotaExceededError
  - `clear()` removes from both storage paths
  - `isInMemoryMode` reflects state correctly

- [ ] 33. **Frontend unit tests** (`src/hooks/__tests__/useConversation.test.ts`)
  - First open: no session → POST /session → messageType 'greeting'
  - Returning visit: session found → GET /session 200 → hydrate → messageType 'resume'
  - Expired session: GET /session 410 → clear → POST /session → messageType 'greeting'
  - 5xx recovery: GET /session 500 → keep session → show recovery greeting
  - Reset: POST /session first → write storage → delete old session fire-and-forget
  - Reset API failure: state unchanged, storage unchanged
  - Concurrent turn: 409 → retry after 300ms → success

- [ ] 34. **Run all tests** — 100% pass rate, zero TypeScript errors across both packages

---

## Completion Checklist

Before marking the spec done, verify:

- [ ] `npx tsc --noEmit` in `apps/api` — zero errors
- [ ] `npm run lint` in project root — zero errors
- [ ] Widget opens fresh → session created → conversation works
- [ ] Refresh page → session resumes → prior messages shown
- [ ] Booking completes → lead enriched with AI memory
- [ ] Reset button → new session → fresh greeting
- [ ] Two rapid messages → 409 handled gracefully → retry succeeds
- [ ] Private browsing → in-memory session → no crashes
- [ ] `GET /session` response contains no phone, email, address, or `conversationId`
- [ ] Existing `widgetChat` requests with `conversationId` (no `widgetSessionId`) still work

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 2] },
    { "wave": 2, "tasks": [3, 4, 5] },
    { "wave": 3, "tasks": [6] },
    { "wave": 4, "tasks": [7] },
    { "wave": 5, "tasks": [8, 9] },
    { "wave": 6, "tasks": [10] },
    { "wave": 7, "tasks": [11] },
    { "wave": 8, "tasks": [12] },
    { "wave": 9, "tasks": [13, 14] },
    { "wave": 10, "tasks": [15] },
    { "wave": 11, "tasks": [16] },
    { "wave": 12, "tasks": [17] },
    { "wave": 13, "tasks": [18, 19, 20] },
    { "wave": 14, "tasks": [21] },
    { "wave": 15, "tasks": [22, 23, 24] },
    { "wave": 16, "tasks": [25, 26, 27] },
    { "wave": 17, "tasks": [28] },
    { "wave": 18, "tasks": [29] },
    { "wave": 19, "tasks": [30] },
    { "wave": 20, "tasks": [31, 32, 33] },
    { "wave": 21, "tasks": [34] }
  ]
}
```
                        │
              ┌─────────┼──────────┐
              ▼         ▼          ▼
           Task 3    Task 4     Task 5
         (create)  (resume)  (delete)
              └─────────┬──────────┘
                        ▼
                     Task 6
                 (rate limiting)
                        │
                        ▼
                     Task 7
                (widgetChat upgrade)
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
           Task 8              Task 9
            (CAS)           (__resume__)
              └─────────┬──────────┘
                        ▼
                    Task 10
                  (tsc check)
                        │
                        ▼
                    Task 11
               (CRM enrichment)
                        │
                        ▼
                    Task 12
                  (tsc check)
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
          Task 13             Task 14
        (expiry job)       (server wire)
              └─────────┬──────────┘
                        ▼
                    Task 15
                (tsc + tests)
                        │
                        ▼
                    Task 16
              (widgetSession.ts)
                        │
                        ▼
                    Task 17
                  (tsc check)
                        │
              ┌─────────┴──────────┐
              ▼                    ▼
          Task 18             Task 19
       (apiClient         (apiClient
        session)              chat)
              └─────────┬──────────┘
                        ▼
                    Task 20
                (apiClient book)
                        │
                        ▼
                    Task 21
                  (tsc check)
                        │
              ┌─────────┼──────────┐
              ▼         ▼          ▼
          Task 22   Task 23    Task 24
         (types)  (lifecycle) (hydrate)
              └─────────┬──────────┘
              ┌─────────┼──────────┐
              ▼         ▼          ▼
          Task 25   Task 26    Task 27
          (reset)  (expose)    (send)
              └─────────┬──────────┘
                        ▼
                    Task 28
                  (tsc check)
                        │
                        ▼
                    Task 29
                 (hydration UI)
                        │
                        ▼
                    Task 30
                (lint + smoke)
                        │
              ┌─────────┼──────────┐
              ▼         ▼          ▼
          Task 31   Task 32    Task 33
        (backend)  (storage)  (hook
          tests)    tests)     tests)
              └─────────┬──────────┘
                        ▼
                    Task 34
                (all tests pass)
```

## Notes

- **Backward compatibility is maintained throughout.** The `/chat` endpoint accepts
  both `widgetSessionId` (new) and `conversationId` (legacy) and routes to the
  correct session lookup path. No existing session documents need migration.

- **`schemaVersion` starts at 1.** Increment it only when the `memory` or `progress`
  shape changes in a way that would break hydration. Document the change in CHANGELOG.

- **The `seq` field defaults to 0.** Existing documents without `seq` will have
  `seq: 0` applied by Mongoose defaults on the next read. The CAS query
  `{ _id, seq: 0 }` will match and promote the document to `seq: 1` on the first
  turn — this is correct and safe.

- **Rate limiter stores are in-process.** For single-instance deployments this is
  fine. For multi-instance deployments (horizontal scaling), replace the default
  `MemoryStore` with `rate-limit-mongo` or a Redis adapter — the API is identical.

- **The expiry job uses `node-cron`** which is already a project dependency
  (`apps/api/package.json`). No new dependency is needed.
