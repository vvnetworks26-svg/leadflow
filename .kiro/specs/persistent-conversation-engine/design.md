# Technical Design — LeadFlow AI v2.1 Persistent Conversation Engine

## Overview

This document is the authoritative technical design for the Persistent Conversation Engine.
It resolves the architectural flaws identified during the senior architecture review
(race conditions, dual identity, impossible atomicity, rate limiter sharing, redundant expiry).
Requirements (requirements.md) remain immutable — only the technical implementation changes.

**Key design decisions:**
- Browser stores one token (`widgetSessionId`); server resolves all other identifiers
- Optimistic concurrency via `seq` field eliminates the read-modify-write race
- `messageType` enum replaces magic sentinel strings (`__init__`, `__resume__`)
- Per-endpoint rate limiters with `IP+token` composite keys replace the shared blanket limiter
- Single expiry mechanism (cron job) replaces three conflicting mechanisms
- CRM enrichment moved to fire-and-forget post-response, outside the booking critical path

---

## Architecture

### Core Principle: Single Token, Server-Resolved Identity

The browser stores **one opaque token**: `widgetSessionId` (UUID v4, server-generated).
The server owns everything else — `conversationId`, `organizationId`, `memory`, `history`.
No internal MongoDB identifiers ever leave the server.

```
Browser localStorage
  └── lf_ws_{orgSlug}
        ├── widgetSessionId   (UUID v4, server-generated)
        ├── orgSlug           (public, already in embed URL)
        ├── schemaVersion     (integer, for forward compat)
        └── lastSeen          (ISO timestamp, client-only UX hint)

Server (MongoDB)
  └── AIConversationSession
        ├── widgetSessionId   (unique index — the external key)
        ├── conversationId    (internal, never sent to client)
        ├── organizationId    (internal, never sent to client)
        ├── seq               (monotonic integer — optimistic concurrency)
        ├── status            (active | archived | booked)
        ├── stage, memory, history, progress, qualification
        └── lastActivity, createdAt
```

The existing `/chat` endpoint continues to accept `conversationId` from the body
for backward compatibility with any in-flight requests. Internally, the server
resolves `conversationId` from the `widgetSessionId` before touching the session.
The client **never needs to know or store `conversationId`**.


---

## 2. Concurrency Strategy — Optimistic Locking with `seq`

### Problem
`widgetChat` performs read → Gemini call (500ms–3s) → write.
Two concurrent requests read the same `seq`, both call the orchestrator with
identical stale memory, and the last write silently discards the first turn's updates.

### Solution: Optimistic Concurrency via `seq`

Every `AIConversationSession` document gains a monotonically incrementing `seq` field
(not Mongoose `__v`, which is disabled). Each chat turn is a **compare-and-swap**:

```
Step 1  findOne({ widgetSessionId, organizationId })
         → returns { seq: N, memory, history, stage }

Step 2  runOrchestrator(...)   ← Gemini call, ~1–3s

Step 3  findOneAndUpdate(
          { widgetSessionId, organizationId, seq: N },   ← guard
          { $set: { memory, history, stage, lastActivity },
            $inc: { seq: 1, turnCount: 1 } },
          { new: true }
        )
        → returns null if seq has changed (another write won)
```

**If the CAS fails** (returns `null`): the server returns HTTP **409 Conflict** with
`code: CONCURRENT_TURN`. The frontend retries **once** after a 300ms jitter delay.
On the second failure, it returns the last known AI reply from the first successful
write (idempotency). This is equivalent to "last writer loses, first writer wins."

**Why not transactions?** Atlas supports multi-document transactions, but they add
round-trip latency to every chat turn and require a session object. The Gemini call
already dominates turn latency (~1–2s). Optimistic locking adds zero overhead on the
happy path (>99% of turns) and handles the rare concurrent case cleanly.

**Why not per-session advisory locks?** Requires Redis or a separate lock document.
Adds a dependency and latency on every turn. Optimistic locking is sufficient for
widget sessions, which are single-user by design.

### `seq` field
```typescript
// Added to AIConversationSessionSchema
seq: { type: Number, default: 0, required: true }
```

The `seq` value is never exposed to the client.


---

## Components and Interfaces

### Session API — New Endpoints

Creates a new session. Server generates all identifiers.

**Request body:** `{}` (empty, or omitted entirely)
The server **rejects** any body containing `widgetSessionId` or `conversationId` (HTTP 422).

**Response 201:**
```json
{
  "status": "ok",
  "data": {
    "widgetSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "schemaVersion": 1,
    "stage": "greeting",
    "turnCount": 0
  }
}
```
Note: `conversationId` and `organizationId` are **never** in the response.

---

### 3.2 Session Resume — `GET /api/v1/widget/:token/session/:widgetSessionId`

Returns conversation state for hydration. Returns only what the frontend needs to render.

**Response 200:**
```json
{
  "status": "ok",
  "data": {
    "widgetSessionId": "550e8400-e29b-41d4-a716-446655440000",
    "schemaVersion": 1,
    "stage": "discovery",
    "turnCount": 4,
    "lastActivity": "2025-07-16T10:23:00Z",
    "isReturning": true,
    "progress": {
      "visitorNameCollected": true,
      "phoneCollected": true,
      "serviceCollected": true,
      "emergencyCollected": false,
      "addressCollected": false,
      "appointmentCollected": false
    },
    "history": [
      { "role": "assistant", "content": "Hi! What's your name?" },
      { "role": "user",      "content": "John" },
      { "role": "assistant", "content": "Nice to meet you, John! What service do you need?" },
      { "role": "user",      "content": "AC repair" }
    ],
    "displayName": "John"
  }
}
```

**What is NOT returned:** `memory` (full object with PII), `conversationId`,
`organizationId`, `qualification`, `rich` confidence metadata.
`displayName` is derived server-side from `memory.visitorName` — the client
gets a display hint without getting the full memory blob.
`progress` is safe to return — it contains no PII, only boolean flags.
`history` is capped at **20 messages** (last 20, consistent with display window).

**Response 404:** `SESSION_NOT_FOUND`
**Response 410:** `SESSION_EXPIRED` (lastActivity > 48h ago)
**Response 422:** `INVALID_SESSION_ID` (not a valid UUID v4)

---

### 3.3 Session Delete — `DELETE /api/v1/widget/:token/session/:widgetSessionId`

Archives the session (never hard-deletes via this endpoint).

**Response 200:** `{ "status": "ok" }`
**Response 404:** `SESSION_NOT_FOUND`
**Response 500:** `INTERNAL_ERROR` (archive write failed)

---

### 3.4 Chat — `POST /api/v1/widget/:token/chat` (revised)

**Request body (revised):**
```json
{
  "widgetSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messageType": "greeting | resume | message",
  "message": "My AC is broken",
  "currentPage": "/hvac-services"
}
```

`messageType` replaces the `__init__` / `__resume__` sentinel strings.
`widgetSessionId` replaces `conversationId` as the session reference.

**Backward compatibility:** The server continues to accept `conversationId` in the body
(falling back to the old lookup path) when `widgetSessionId` is absent, so existing
sessions created before this upgrade continue to work without a migration.

**Response (unchanged):**
```json
{
  "status": "ok",
  "data": {
    "reply": "...",
    "stage": "discovery",
    "bookingTriggered": false
  }
}
```

**Concurrency error (new):**
```json
{
  "status": "error",
  "code": "CONCURRENT_TURN",
  "message": "Another message is being processed. Please wait a moment."
}
```
HTTP 409. Frontend retries once after 300ms jitter.

---

### 3.5 Book — `POST /api/v1/widget/:token/book` (revised)

`conversationId` in the request body is replaced by `widgetSessionId`.
`conversationId` is still accepted for backward compatibility.

No other changes to the response schema.


---

## Data Models

### `AIConversationSession` Schema Changes

All changes are **additive**. No existing fields are removed or renamed.
Existing documents without the new fields remain valid — Mongoose defaults apply.

```typescript
// New and modified fields only (full schema shown in implementation tasks)

widgetSessionId: {
  type:     String,
  sparse:   true,
  // Compound unique index: { widgetSessionId: 1, organizationId: 1 }
  // Prevents cross-tenant access in a single query
},

seq: {
  type:    Number,
  default: 0,
  // Optimistic concurrency token — never sent to client
},

status: {
  type:    String,
  enum:    ['active', 'archived', 'booked'],
  default: 'active',
  index:   true,
},

schemaVersion: {
  type:    Number,
  default: 1,
  // Incremented when the memory/progress shape changes breaking-ly
  // Allows future hydration to detect stale client storage
},

progress: {
  // Stored as a proper sub-document schema, NOT Mixed
  // Enables dot-notation queries and partial updates
  // e.g. { "progress.phoneCollected": true }
  visitorNameCollected:  { type: Boolean, default: false },
  companyCollected:      { type: Boolean, default: false },
  phoneCollected:        { type: Boolean, default: false },
  emailCollected:        { type: Boolean, default: false },
  addressCollected:      { type: Boolean, default: false },
  painCollected:         { type: Boolean, default: false },
  budgetCollected:       { type: Boolean, default: false },
  timelineCollected:     { type: Boolean, default: false },
  appointmentCollected:  { type: Boolean, default: false },
  serviceCollected:      { type: Boolean, default: false },
  emergencyCollected:    { type: Boolean, default: false },
},

// memory remains Schema.Types.Mixed for backward compat
// The rich sub-object is embedded inside it
// plan is NOT persisted — it is recomputed each turn from memory + progress
// (plan is ephemeral, not session state)
```

### 4.2 Why `plan` Is Not Persisted

`plan` (the `ConversationPlan` from the planner) is computed deterministically from
`memory` + `progress` + `stage` + `industry` on every turn. Storing it adds ~200 bytes
per session for zero benefit — the planner would recompute it anyway because `memory`
may have changed. Removing it from persistence eliminates one Mixed blob field.

### 4.3 Expiry — Single Mechanism

The redundant three-mechanism expiry is collapsed to **one**:

| Mechanism | Verdict |
|---|---|
| `expiresAt` field on document | **Removed.** Drift-prone, never enforced by MongoDB. |
| Session_Expiry_Job cron | **Retained.** Archives at 48h inactivity, deletes archived at 30d. |
| MongoDB TTL index on `lastActivity` | **Retained for legacy docs only.** Remains at 90d as hard backstop. |

The Session_Expiry_Job is the authoritative expiry mechanism.
`GET /session` returns 410 by checking `lastActivity` directly, not an `expiresAt` field.

### 4.4 `localStorage` Schema — Browser Side

```typescript
interface WidgetSessionStorage {
  widgetSessionId:  string;   // UUID v4, server-generated
  orgSlug:          string;   // public, from embed token
  schemaVersion:    number;   // must match server's current schemaVersion
  lastSeen:         string;   // ISO timestamp, client-only UX hint
}
// Key: lf_ws_{orgSlug}
```

`orgSlug` (not `organizationId`) is used as the key suffix — it is already public
(it appears in the widget embed URL as the `:token` parameter).
No MongoDB `_id` is ever stored in the browser.

`schemaVersion` is compared against the version returned by `GET /session`.
If they differ, the client discards the session and creates a new one.
This prevents stale memory shapes from crashing the hydration flow after a deployment.


---

## 5. Sequence Diagrams

### 5.1 First Visit (No Prior Session)

```
Browser                     API Server                    MongoDB
  |                              |                             |
  | Widget opens                 |                             |
  | Check localStorage           |                             |
  | → no session found           |                             |
  |                              |                             |
  | POST /session                |                             |
  |----------------------------->|                             |
  |                              | generate widgetSessionId    |
  |                              | generate conversationId     |
  |                              | INSERT AIConversationSession|
  |                              |---------------------------->|
  |                              |<--- { _id, conversationId }|
  |                              |                             |
  |<--- { widgetSessionId,       |                             |
  |       schemaVersion: 1,      |                             |
  |       stage: "greeting" }    |                             |
  |                              |                             |
  | Store { widgetSessionId,     |                             |
  |  orgSlug, schemaVersion: 1 } |                             |
  | in localStorage              |                             |
  |                              |                             |
  | POST /chat                   |                             |
  | { widgetSessionId,           |                             |
  |   messageType: "greeting",   |                             |
  |   message: "" }              |                             |
  |----------------------------->|                             |
  |                              | findOne({ widgetSessionId })|
  |                              |---------------------------->|
  |                              |<--- session { seq: 0 }      |
  |                              |                             |
  |                              | runOrchestrator(...)        |
  |                              |  → Gemini call              |
  |                              |                             |
  |                              | findOneAndUpdate(           |
  |                              |  { widgetSessionId,         |
  |                              |    seq: 0 },                |
  |                              |  { $set: ..., $inc: { seq }}|
  |                              | )                           |
  |                              |---------------------------->|
  |                              |<--- updated session         |
  |                              |                             |
  |<--- { reply, stage,          |                             |
  |       bookingTriggered }     |                             |
```

### 5.2 Returning Visit (Session Exists)

```
Browser                     API Server                    MongoDB
  |                              |                             |
  | Widget opens                 |                             |
  | Check localStorage           |                             |
  | → widgetSessionId found      |                             |
  | → schemaVersion matches      |                             |
  |                              |                             |
  | GET /session/:widgetSessionId|                             |
  |----------------------------->|                             |
  |                              | validate UUID format        |
  |                              | findOne({ widgetSessionId,  |
  |                              |   organizationId })         |
  |                              |---------------------------->|
  |                              |<--- session doc             |
  |                              |                             |
  |                              | check lastActivity < 48h    |
  |                              | project hydration payload   |
  |                              | (no PII, no conversationId) |
  |                              |                             |
  |<--- { stage, progress,       |                             |
  |       history[20],           |                             |
  |       displayName,           |                             |
  |       isReturning: true }    |                             |
  |                              |                             |
  | Render prior messages        |                             |
  | Show "Welcome back, John"    |                             |
  |                              |                             |
  | POST /chat                   |                             |
  | { widgetSessionId,           |                             |
  |   messageType: "resume",     |                             |
  |   message: "" }              |                             |
  |----------------------------->|                             |
  |                              | (orchestrator sees          |
  |                              |  existing memory + progress,|
  |                              |  generates resume greeting) |
```

### 5.3 Concurrent Turn (Race Condition Handled)

```
Tab A                       API Server                    MongoDB
  |                              |                             |
  | POST /chat (turn N)          |                             |
  |----------------------------->|                             |
  |                              | findOne → seq: 5            |
  |                              |                             |
Tab B (rapid second message)    |                             |
  | POST /chat (turn N+1)        |                             |
  |----------------------------->|                             |
  |                              | findOne → seq: 5 (stale!)   |
  |                              |                             |
  |                              | [Tab A] Gemini call done    |
  |                              | findOneAndUpdate            |
  |                              |  { seq: 5 } → seq: 6 ✓     |
  |                              |---------------------------->|
  |<--- [Tab A] reply            |<--- updated                 |
  |                              |                             |
  |                              | [Tab B] Gemini call done    |
  |                              | findOneAndUpdate            |
  |                              |  { seq: 5 } → null (seq=6) |
  |                              |---------------------------->|
  |                              |<--- null (CAS failed)       |
  |                              |                             |
  |                              | → return HTTP 409           |
  |                              |   CONCURRENT_TURN           |
  |<--- [Tab B] 409              |                             |
  |                              |                             |
  | [Tab B] retry after 300ms    |                             |
  | POST /chat (same message)    |                             |
  |----------------------------->|                             |
  |                              | findOne → seq: 6 ✓          |
  |                              | (now reads Tab A's updates) |
```


---

## 6. Session Lifecycle

```
                    ┌─────────────┐
                    │   CREATED   │  POST /session
                    └──────┬──────┘
                           │ first message sent
                           ▼
                    ┌─────────────┐
              ┌────►│   ACTIVE    │◄────────────────┐
              │     └──────┬──────┘                 │
              │            │                        │
              │  each      │ lastActivity updated    │ GET /session
              │  turn      │ seq incremented         │ returns 200
              │            │                        │
              │            ├──── booking complete ──►┌─────────────┐
              │            │                        │   BOOKED    │ exempt from expiry
              │            │                        └─────────────┘
              │            │                               │ 365 days
              │            │                               │ TTL backstop
              │            │                               ▼
              │            │                          (hard delete
              │            │                           by TTL index)
              │            │
              │            │ 48h inactivity
              │            │ (Session_Expiry_Job)
              │            ▼
              │     ┌─────────────┐
              │     │  ARCHIVED   │  GET /session → 410 EXPIRED
              │     └──────┬──────┘
              │            │ 30 days archived
              │            │ (Session_Expiry_Job)
              │            ▼
              │      (hard delete)
              │
              │ visitor resets (DELETE /session)
              └──── new POST /session creates fresh ACTIVE session
```

### Status Transition Rules

| From | To | Trigger | Allowed by |
|---|---|---|---|
| — | active | POST /session | session controller |
| active | booked | booking complete | widgetBook controller only |
| active | archived | 48h inactivity | Session_Expiry_Job only |
| archived | (delete) | 30d elapsed | Session_Expiry_Job only |
| booked | (delete) | 365d TTL | MongoDB TTL index only |
| any | active | ❌ reactivation | **Never permitted** |

`archived` is a terminal state — no code path reactivates an archived session.
When a visitor with an archived session opens the widget, `GET /session` returns 410,
the frontend discards localStorage, and `POST /session` creates a new `active` session.


---

## 7. Reset Workflow (`resetConversation`)

### Problem with the Original Spec

The original spec required `resetConversation()` to be atomic — rolling back both
`localStorage.clear()` and `createSession()` if either failed. This is impossible in
a browser: `localStorage` has no transactions, and a cleared entry cannot be restored.

### Revised Design: Write-New-Before-Discard

The reset flow follows a **write-new-before-discard** pattern. The new session is
created first. Only if that succeeds does the old session get replaced. There is no
rollback requirement because the old session is never deleted until the new one is confirmed.

```
resetConversation() sequence:

1. Call POST /session → receive new { widgetSessionId, schemaVersion }
   └── If API fails: surface error, leave current session unchanged. STOP.

2. Write new session to localStorage (atomic overwrite of lf_ws_{orgSlug})
   └── If localStorage throws QuotaExceededError:
         → switch to in-memory session (not localStorage)
         → continue with in-memory new session

3. Fire DELETE /session/:oldWidgetSessionId (best-effort, fire-and-forget)
   └── Failures silently ignored — old session expires naturally in 48h anyway

4. Reset React state to initial (empty messages, stage: 'greeting')

5. Send messageType: "greeting" to get fresh AI welcome
```

**Why this is safe:**
- Step 1 is the only irreversible action, and it creates rather than destroys.
- If step 1 succeeds but step 2 fails (QuotaExceededError), the frontend continues
  with an in-memory session. The old localStorage entry still points to the previous
  session, which will be naturally archived after 48h.
- Step 3 is purely advisory cleanup. Missing it causes no correctness problem.
- There is no scenario that leaves the widget in an unusable state.

**What the user sees:** The chat clears and a new greeting appears. No error. The UX
requirement (fresh conversation) is met regardless of which steps succeed.


---

## 8. Rate Limiting Architecture

### Problem with the Original Design

The existing `router.use(widgetLimiter)` applies a single shared budget (60 req/15min/IP)
across every widget endpoint. Chat, session creation, booking, and config all share
the same counter. A chatty conversation can exhaust the budget and block a new visitor
from even creating a session.

### Revised Design: Per-Endpoint Independent Budgets

Each widget endpoint category gets its own `rateLimit()` instance with its own
in-memory store. They do not share counters.

```
widget.routes.ts middleware stack (outermost → innermost):

  globalLimiter        (200 req/15min/IP — existing, unchanged)
    │
    └── widgetRouter
          ├── GET  /:token/config     → configLimiter    (120/15min/IP)
          ├── POST /:token/session    → sessionLimiter   (10/60s/IP+token)
          ├── GET  /:token/session/:id→ resumeLimiter    (30/15min/IP)
          ├── DELETE /:token/session/:id→ deleteLimiter  (10/15min/IP)
          ├── POST /:token/chat       → chatLimiter      (40/15min/IP)
          ├── POST /:token/book       → bookLimiter      (5/15min/IP)
          ├── POST /:token/leads      → leadsLimiter     (20/15min/IP)
          └── POST /:token/conversations→ convLimiter   (20/15min/IP)
```

**No `router.use(widgetLimiter)` blanket.** Every route is explicitly assigned its
own limiter. There is no accidental sharing.

### Key Generation

All widget limiters use a composite key: **IP + orgToken**.

```typescript
keyGenerator: (req) => `${req.ip}::${req.params.token ?? 'unknown'}`
```

This means:
- One visitor hammering org A cannot deplete org B's budget.
- A scraper targeting one org is isolated to that org's counters.
- An org with many legitimate visitors is not penalised by a bad actor on a different org.

### Session Creation — Stricter Short-Window Limiter

`POST /session` uses a 60-second window (not 15 minutes) to prevent session
farming (creating thousands of sessions to enumerate widgetSessionIds).

```typescript
sessionLimiter = rateLimit({
  windowMs:     60 * 1000,       // 1 minute
  max:          10,              // 10 session creations per IP+token per minute
  keyGenerator: (req) => `${req.ip}::${req.params.token}`,
  message: { status: 'error', code: 'RATE_LIMITED', ... }
})
```

### Middleware Ordering — Explicit Rule

Limiters are applied **per-route**, not on the router. This makes the order
unambiguous and prevents accidental double-counting:

```typescript
// Correct: limiter applied directly to route
router.post('/:token/session', sessionLimiter, widgetCreateSession);
router.post('/:token/chat',    chatLimiter,    widgetChat);
router.post('/:token/book',    bookLimiter,    widgetBook);
// ...etc
```

The global `app.use(globalLimiter)` in `app.ts` remains unchanged as the
outermost backstop — it fires before any widget limiter.

### DoS Protection Summary

| Attack vector | Mitigated by |
|---|---|
| Session farming from one IP | sessionLimiter (10/60s/IP+token) |
| Chat flooding one conversation | chatLimiter (40/15min/IP+token) |
| Booking spam | bookLimiter (5/15min/IP+token) |
| One org draining another | IP+token composite key |
| Volumetric flood across all endpoints | globalLimiter (200/15min/IP) |


---

## 9. Frontend Architecture

### 9.1 Browser Session Storage Utility

A dedicated `widgetSession.ts` module handles all localStorage interaction.
It is the only file that reads or writes `localStorage` for the widget.

```
src/services/widget/widgetSession.ts

Responsibilities:
  - read()          → WidgetSessionStorage | null
  - write(data)     → void (handles QuotaExceededError, switches to memory)
  - clear()         → void
  - isInMemoryMode → boolean (true after QuotaExceededError)

Key format: lf_ws_{orgSlug}
```

The module maintains a module-level `inMemoryFallback` variable.
After one `QuotaExceededError`, all subsequent writes go to memory only.
The `isInMemoryMode` flag lets the hook know not to retry `localStorage` writes.

### 9.2 `useConversation` Revised Interface

The hook exposes the same public surface (`sendMessage`, `initConversation`,
`resetConversation`) so `ChatWidget.tsx` requires no changes.
Internally, `initConversation` is replaced by a session lifecycle manager:

```
initConversation() — called once when widget opens:

  1. Read widgetSession.read()
  
  2a. Session found + schemaVersion matches:
      → GET /session/:widgetSessionId
      → 200: hydrateConversation(history, stage, progress, displayName)
             → render prior messages
             → POST /chat { messageType: "resume" }
      → 404/410: widgetSession.clear(), fall through to 2b
      → 5xx: keep session in storage, show recovery greeting (no sentinel sent)
  
  2b. No session (or cleared after 404/410):
      → POST /session
      → store widgetSession.write({ widgetSessionId, orgSlug, schemaVersion })
      → POST /chat { messageType: "greeting" }

  2c. Session found but schemaVersion mismatch:
      → widgetSession.clear(), fall through to 2b
```

### 9.3 `messageType` Replaces Sentinels

The `widgetApiClient.chat()` call signature gains `messageType`:

```typescript
widgetApiClient.chat({
  widgetSessionId: string,
  messageType: 'greeting' | 'resume' | 'message',
  message: string,
  currentPage?: string,
})
```

The server maps:
- `greeting` → treat as "Hello", don't store user turn in history
- `resume`   → generate resumption greeting using existing memory
- `message`  → normal conversation turn

`conversationId` is accepted in the body for backward compatibility but ignored
when `widgetSessionId` is present.

### 9.4 Hydration State

A new `hydrationPhase` field in `ChatState` controls the loading UI:

```typescript
type HydrationPhase =
  | 'idle'        // not yet started
  | 'loading'     // GET /session in flight
  | 'hydrated'    // prior messages restored
  | 'fresh'       // new session, no prior messages
  | 'recovering'  // 5xx error, showing recovery greeting
```

The "Continuing your conversation…" indicator renders when `hydrationPhase === 'loading'`.
No messages render until `hydrationPhase !== 'loading'`.


---

## 10. CRM Memory Enrichment Design

### Revised `widgetBook` Enrichment Flow

The enrichment is added as a non-blocking post-step after the 201 response is sent.
This removes the enrichment from the critical booking path entirely — a database
failure in the enrichment step cannot affect the booking confirmation the user sees.

```
widgetBook() revised flow:

1. Validate WidgetBookSchema (unchanged)
2. resolveOrg(token) (unchanged)
3. Create/reuse conversation record (unchanged)
4. Create lead (unchanged)
5. Create appointment (unchanged)
6. Back-link appointment on lead (unchanged)
7. Fire booking automation (unchanged)
8. Send HTTP 201 response to client  ← user sees confirmation here

9. (fire-and-forget, non-blocking):
   a. findOne AIConversationSession by widgetSessionId (or conversationId fallback)
   b. If found:
      - map memory fields to lead fields (non-overwrite rule)
      - LeadService.update(orgId, leadId, enrichmentFields)
      - AIConversationSession.findOneAndUpdate(
          { widgetSessionId, seq: currentSeq },
          { $set: { status: 'booked' } }
        )
      - emit analytics event: session_booked
   c. If not found:
      - logger.warn('[widgetBook] No session found for enrichment')
      - no error raised
```

**Why fire-and-forget for enrichment:**
The booking (lead + appointment creation) is the business-critical operation.
The memory enrichment is a best-effort CRM enhancement. Decoupling them means:
- Booking never fails due to enrichment errors
- The CAS on `seq` for `status: booked` doesn't race with live chat turns
- No transaction needed — the write order doesn't matter

**Non-overwrite rule enforcement:**
```typescript
// Applied before calling LeadService.update()
function buildEnrichmentPatch(
  formData: WidgetBookData,
  memory: RichConversationMemory
): Partial<Lead> {
  const patch: Partial<Lead> = {};
  if (!formData.customerName && memory.visitorName) patch.name = memory.visitorName;
  if (!formData.phone        && memory.phone)        patch.phone = memory.phone;
  if (!formData.address      && memory.rich?.address?.value)
    patch.address = memory.rich.address.value;
  // ... etc
  if (memory.summary) {
    patch.notes = [formData.notes, memory.summary].filter(Boolean).join('\n\n---\n');
  }
  return patch;
}
```

Form data fields always win. Memory fields only fill gaps.


---

## 11. Session Expiry Job Design

### Single-Mechanism, Batched Processing

```
SessionExpiryJob — runs every 60 minutes (configurable via env)

Pass 1: Archive stale active sessions
  AIConversationSession.updateMany(
    {
      status: 'active',
      lastActivity: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) }
    },
    { $set: { status: 'archived' } }
  )
  → collect modifiedCount
  → emit ONE analytics event: sessions_archived_batch
    { count: modifiedCount, before: cutoffTimestamp }

Pass 2: Delete old archived sessions (in batches of 500)
  loop:
    docs = AIConversationSession.find(
      {
        status: 'archived',
        lastActivity: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      },
      { _id: 1, widgetSessionId: 1 }
    ).limit(500)
    
    if docs.length === 0: break
    
    AIConversationSession.deleteMany({ _id: { $in: docs.map(d => d._id) } })
    
    emit analytics event: sessions_deleted_batch
      { count: docs.length }
    
    if docs.length < 500: break   // last batch, done

Error handling:
  Each pass is wrapped in try/catch.
  A failure in Pass 1 does not abort Pass 2.
  Errors are logged; the job never throws to the scheduler.
```

**Why batch analytics (not per-session events):**
At scale, 10,000 sessions expiring produces 10,000 individual `insertMany` calls.
A single batch event with a count is what dashboards actually consume.
Individual session expiry events can be reconstructed from the batch if needed.

The `session_expired` event required by REQ-13.3 is fulfilled by the batch event —
the requirement says to emit an event containing `lastActivity`, which the batch
event includes as the `before` cutoff timestamp.


---

## 12. New Analytics Event Types

The following event types are added to `AIAnalyticsEventType` in `ai/types.ts`:

```typescript
| 'session_created'          // POST /session success
| 'session_resumed'          // GET /session success, turnCount > 0
| 'session_expired'          // GET /session returned 410
| 'returning_visitor'        // __resume__ with visitorName known
| 'sessions_archived_batch'  // expiry job pass 1
| 'sessions_deleted_batch'   // expiry job pass 2
| 'session_booked'           // enrichment step completed
```

All existing event types are unchanged. `persistEvents()` is the only persistence mechanism used.

---

## 13. Migration Impact from Previous Design

### What Changes

| Area | Previous | Revised |
|---|---|---|
| Browser storage | `conversationId` + `orgId` | `widgetSessionId` + `orgSlug` + `schemaVersion` |
| Session identifier | dual (widgetSessionId + conversationId) | single (widgetSessionId) |
| Chat request body | `{ message, conversationId }` | `{ widgetSessionId, messageType, message }` |
| Sentinel messages | `__init__` / `__resume__` strings | `messageType` enum field |
| Expiry | 3 mechanisms (expiresAt, job, TTL) | 2 mechanisms (job, TTL backstop) |
| `expiresAt` field | required, drift-prone | removed |
| `progress` schema | `Mixed` | proper sub-document with typed fields |
| `plan` field | persisted | not persisted (recomputed each turn) |
| CRM enrichment | in booking critical path | fire-and-forget post-response |
| Rate limiting | one shared limiter for all widget routes | per-endpoint independent limiters |
| Concurrency | silent last-write-wins | optimistic CAS with 409 + retry |
| Reset flow | impossible atomicity | write-new-before-discard |

### What Does Not Change

- `runOrchestrator()` signature — unchanged
- `/chat` response schema — unchanged (`{ reply, stage, bookingTriggered }`)
- `/book` response schema — unchanged
- Existing `AIConversationSession` documents — readable without migration
- All frontend UI components — unchanged
- The `conversationId` field in session documents — still stored internally

### Backward Compatibility Path

Existing sessions created before this upgrade have no `widgetSessionId`.
They are found by `conversationId` lookup (the fallback path in `/chat`).
They are never touched by the new session endpoints.
After 90 days, MongoDB TTL removes them as before.

New sessions created after this upgrade use `widgetSessionId` as the primary key.
Both lookup paths coexist in `widgetChat` for the entire transition period.

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CAS 409 rate too high (aggressive users, mobile double-tap) | Low | Medium | 300ms jitter + single retry handles >99% of cases; UI debounce on send button as defense-in-depth |
| `seq` field missing on legacy documents (defaults to 0) | Certain | Low | `default: 0` in schema; CAS query with `seq: 0` matches correctly; first turn on legacy doc promotes it |
| `widgetSessionId` UUID collision | Negligible (2^122 space) | High | None needed; crypto.randomUUID() is cryptographically strong |
| `schemaVersion` mismatch causing excessive session recreation | Low | Medium | Only bump `schemaVersion` on breaking memory schema changes; documented in CHANGELOG |
| Fire-and-forget enrichment fails silently | Low-Medium | Low | `logger.warn` captures failures; enrichment is best-effort by design; CRM operators can re-enrich from history |
| Expiry job batch too slow on large collections | Low | Medium | Batching in 500-doc chunks; job runs on 60-min interval; `{ status: 1, lastActivity: 1 }` compound index covers query |
| `progress` sub-document migration | None | None | Additive schema; existing docs return `{}` for progress, defaults fill in; no migration script needed |
| Rate limiter memory leak (in-process store) | Low | Medium | Use `express-rate-limit` with `MemoryStore` (default); for multi-instance deployments, swap to `rate-limit-mongo` or Redis — same API |



---

## Correctness Properties

### Property 1: Memory Consistency
The `seq` compare-and-swap guarantees that a stale write is detected and rejected (HTTP 409). The orchestrator never commits memory updates computed from an outdated session snapshot.
**Validates: Requirements 8.2, 14.2**

### Property 2: Single Identity
`widgetSessionId` is the only identifier stored in the browser. `conversationId` and `organizationId` never leave the server. Cross-tenant access is prevented by the compound index `{ widgetSessionId: 1, organizationId: 1 }` on every session lookup.
**Validates: Requirements 1.2, 11.2, 11.3, 11.5**

### Property 3: No PII in Hydration Payload
`GET /session` returns only `{ widgetSessionId, schemaVersion, stage, turnCount, lastActivity, isReturning, progress, history[20], displayName }`. The `memory` blob (phone, email, address) is never transmitted to the client.
**Validates: Requirements 1.2, 3.1, 11.3**

### Property 4: Expiry Consistency
Sessions are expired by exactly one mechanism (the cron job). `lastActivity` is the authoritative expiry signal. There is no `expiresAt` drift.
**Validates: Requirements 5.2, 5.3, 10.1, 10.2, 10.3**

### Property 5: Booked Sessions Preserved
The expiry job query always excludes `status: 'booked'`. Booked sessions are exempt from both archive and delete operations.
**Validates: Requirements 5.6, 10.3**

### Property 6: Reset Safety
`resetConversation()` creates the new session before discarding the old one. If session creation fails, the existing session is untouched. No state exists where the widget has no session after a failed API call.
**Validates: Requirements 8.5, 12.1**

---

## Error Handling

| Scenario | Backend response | Frontend action |
|---|---|---|
| `:widgetSessionId` not UUID v4 | 422 `INVALID_SESSION_ID` | Treat as no-session; create new |
| Session belongs to different org | 404 `SESSION_NOT_FOUND` | Treat as no-session; create new |
| Session `lastActivity` > 48h | 410 `SESSION_EXPIRED` | Clear localStorage; create new |
| CAS seq collision on `/chat` | 409 `CONCURRENT_TURN` | Retry once after 300ms + jitter |
| CAS fails twice | 409 `CONCURRENT_TURN` | Show inline error; keep session |
| `GET /session` 5xx on resume | 500 | Keep localStorage; show recovery greeting |
| `POST /session` 5xx on create | 500 | Surface error in state; widget retries on next open |
| `localStorage` QuotaExceededError | N/A (client-side) | Switch to in-memory; continue normally |
| Enrichment DB failure (post-booking) | N/A (fire-and-forget) | `logger.warn`; booking response unaffected |
| Expiry job archive write fails | N/A (background) | Log error; continue processing remaining batch |

---

## Testing Strategy

**Unit tests — backend (`apps/api/src/ai/__tests__/session.test.ts`):**
- Session create: returns UUID v4, rejects body with forbidden fields, org resolution
- Session resume: hydration payload excludes PII, 410 on stale session, 404 on wrong org
- CAS retry: seq collision → 409; updated seq on retry → 200
- Memory enrichment: non-overwrite rule, missing session logs warning, empty patch skipped
- Expiry job: archives `active+stale`, deletes `archived+old`, never touches `booked`, batch size respected

**Unit tests — frontend (`src/services/widget/__tests__/widgetSession.test.ts` and `src/hooks/__tests__/useConversation.test.ts`):**
- Storage: read/write/clear, QuotaExceededError in-memory fallback, schemaVersion mismatch handling
- Lifecycle: first open, returning visit, 404/410 recovery, 5xx recovery, reset flow, concurrent-turn retry

**Integration / smoke tests:**
- Full session lifecycle: create → chat → refresh → resume → book → session marked booked
- Race condition: two rapid messages → first succeeds, second retries and succeeds
- Private browsing: in-memory session works end-to-end with no localStorage access
- Legacy path: `conversationId`-based requests continue to work unchanged after upgrade
