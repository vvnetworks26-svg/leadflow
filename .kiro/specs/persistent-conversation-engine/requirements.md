# Requirements Document

## Introduction

LeadFlow AI v2.1 — Persistent Conversation Engine adds cross-reload session persistence, server-authoritative identity management, returning-visitor recognition, CRM memory enrichment, and a full session lifecycle (creation, resumption, expiry, recovery) to the LeadFlow chat widget. Visitors who close, refresh, or reopen the widget continue exactly where they left off. The AI skips fields it already knows. Booked leads carry full conversation memory into the CRM. All changes are additive and backward-compatible — no existing endpoint signatures, MongoDB documents, or frontend components are altered.

---

## Glossary

- **Widget_Session**: A browser-scoped record stored in `localStorage` containing `widgetSessionId`, `conversationId`, and `orgId`. Created on first open; reused on subsequent opens.
- **WidgetSessionId**: A server-generated UUID v4 that uniquely identifies one browser's session for one organization. Never a MongoDB `_id`.
- **ConversationId**: An opaque string that links a `Widget_Session` to an `AIConversationSession` document in MongoDB. Generated server-side.
- **Session_API**: The new set of REST endpoints — `POST /session`, `GET /session/:id`, `DELETE /session/:id` — that manage Widget_Session lifecycle.
- **AIConversationSession**: The existing MongoDB collection that stores `stage`, `memory`, `history`, `turnCount`, and `lastActivity` for each conversation.
- **RichConversationMemory**: The v2 memory structure (`ConversationMemory` + `rich` fields + `progress`) already present in `ai/types.ts`.
- **Returning_Visitor**: A visitor whose `Widget_Session` exists in `localStorage`, whose `AIConversationSession` is found in MongoDB, and whose `lastActivity` is within the active window (≤ 48 hours inactive).
- **Lead**: A CRM lead document created during the booking flow.
- **Orchestrator**: The `runOrchestrator()` function in `ai/orchestrator.ts`. Its signature must not change.
- **Hydration**: The act of loading a prior `AIConversationSession`'s `stage`, `memory`, and `history` into the frontend on widget open.
- **Session_Expiry**: The policy by which inactive or old sessions transition to `archived` (48 h inactivity) or are deleted (30 days old), except booked sessions.
- **Analytics_Event**: A structured event record emitted to the existing `persistEvents()` pipeline.

---

## Requirements

### Requirement 1: Widget Session Storage

**User Story:** As a returning website visitor, I want the chat widget to remember my previous conversation, so that I do not have to start over every time I open the widget.

#### Acceptance Criteria

1. WHEN a visitor opens the widget for the first time with no prior session in `localStorage`, THE Widget_Session SHALL be created with a server-generated `widgetSessionId`, a server-generated `conversationId`, and the resolved `orgId`.
2. THE Widget_Session SHALL store only `widgetSessionId`, `conversationId`, and `orgId` in `localStorage` — no names, phone numbers, emails, or other PII.
3. WHEN a visitor opens the widget and a valid `Widget_Session` already exists in `localStorage`, THE Widget_Session SHALL be reused without creating a new session.
4. IF `localStorage` is unavailable (private browsing mode or browser restriction), THEN THE Widget_Session SHALL fall back to an in-memory session for the current page lifetime only, without throwing an error, and SHALL log a warning event for monitoring and debugging purposes.
5. THE Widget_Session SHALL be stored under the key `lf_widget_session_{orgId}` so that multiple organizations embedded on the same page do not collide.

---

### Requirement 2: Session API — Create

**User Story:** As the LeadFlow platform, I want a dedicated session creation endpoint, so that session identifiers are always generated server-side and are never trusted from the client.

#### Acceptance Criteria

1. WHEN `POST /api/v1/widget/:token/session` is called, THE Session_API SHALL create a new `AIConversationSession` document and return a `widgetSessionId` (UUID v4), a `conversationId`, and the resolved `organizationId`.
2. THE Session_API SHALL generate `widgetSessionId` using `crypto.randomUUID()` — never using a client-supplied value.
3. THE Session_API SHALL generate `conversationId` using `crypto.randomUUID()` — never using a client-supplied value.
4. WHEN the `:token` does not resolve to an active organization, THE Session_API SHALL return HTTP 404 with error code `ORG_NOT_FOUND` before executing any endpoint-specific logic.
5. IF rate limiting applies and the request would otherwise succeed (organization is valid), THEN THE Session_API SHALL return HTTP 429 with error code `RATE_LIMITED`; IF both rate limiting and organization validation fail simultaneously, THEN THE Session_API SHALL return HTTP 404 (organization validation takes precedence).
6. IF `POST /api/v1/widget/:token/session` is called more than 10 times within 60 seconds from the same IP, THEN THE Session_API SHALL return HTTP 429 with error code `RATE_LIMITED`.
7. THE Session_API SHALL be subject to the existing widget rate limiter (60 requests per 15 minutes per IP).

---

### Requirement 3: Session API — Resume

**User Story:** As a returning visitor, I want the widget to load my previous conversation history and AI memory on open, so that the AI does not repeat questions I have already answered.

#### Acceptance Criteria

1. WHEN `GET /api/v1/widget/:token/session/:widgetSessionId` is called and the session exists and is active, THE Session_API SHALL return `stage`, `memory`, `history` (last 10 messages), `turnCount`, and `lastActivity`.
2. WHEN `GET /api/v1/widget/:token/session/:widgetSessionId` is called and the `widgetSessionId` does not exist or belongs to a different organization, THE Session_API SHALL return HTTP 404 with error code `SESSION_NOT_FOUND`.
3. WHEN `GET /api/v1/widget/:token/session/:widgetSessionId` is called and the session `lastActivity` is more than 48 hours ago, THE Session_API SHALL return HTTP 410 with error code `SESSION_EXPIRED`; THE Session_API SHALL NOT return `SESSION_EXPIRED` for any session whose `lastActivity` is within the past 48 hours.
4. THE Session_API SHALL validate that the `widgetSessionId` is a UUID v4; IF the format is invalid, THEN THE Session_API SHALL return HTTP 422 with error code `INVALID_SESSION_ID`.
5. THE Session_API SHALL never expose the MongoDB `_id` of any document in any response.

---

### Requirement 4: Session API — Delete

**User Story:** As a visitor, I want to be able to start a fresh conversation, so that I can reset my session without clearing my browser's local storage manually.

#### Acceptance Criteria

1. WHEN `DELETE /api/v1/widget/:token/session/:widgetSessionId` is called and the session exists and belongs to the organization, THE Session_API SHALL mark the session as `archived` and return HTTP 200.
2. WHEN `DELETE /api/v1/widget/:token/session/:widgetSessionId` is called and the session does not exist or belongs to a different organization, THE Session_API SHALL return HTTP 404 with error code `SESSION_NOT_FOUND`.
3. THE Session_API SHALL NOT permanently delete an `AIConversationSession` via the DELETE endpoint — archiving is the only allowed mutation; once a session is `archived`, it SHALL NOT be reactivated or transitioned to any other status.
4. THE Session_API SHALL check that the session exists and belongs to the organization before attempting to archive it; IF the session does not exist or belongs to a different organization, THE Session_API SHALL return HTTP 404; IF the archiving operation subsequently fails due to a database error or other technical issue, THEN THE Session_API SHALL return HTTP 500 with error code `INTERNAL_ERROR`.

---

### Requirement 5: MongoDB Session Upgrade

**User Story:** As the platform, I want the `AIConversationSession` schema to carry the fields needed for session lifecycle management, so that resume, expiry, and CRM enrichment all work correctly.

#### Acceptance Criteria

1. THE AIConversationSession Schema SHALL add the following optional fields without removing or renaming any existing field: `widgetSessionId` (String, sparse index), `status` (enum: `active` | `archived` | `booked`, default `active`), `expiresAt` (Date), `progress` (Mixed), `plan` (Mixed).
2. WHEN a new session is created, THE AIConversationSession Schema SHALL set `expiresAt` to 48 hours after `lastActivity`.
3. WHEN `lastActivity` is updated, THE AIConversationSession Schema SHALL recalculate `expiresAt` to 48 hours after the new `lastActivity`.
4. THE AIConversationSession Schema SHALL retain the existing TTL index (`lastActivity`, `expireAfterSeconds: 90 * 24 * 60 * 60`) so that legacy documents without `expiresAt` continue to be purged on their original schedule.
5. THE AIConversationSession Schema SHALL add a sparse unique index on `widgetSessionId` so that two sessions cannot share the same `widgetSessionId`.
6. WHEN a booking is completed, THE AIConversationSession Schema SHALL atomically set `status` to `booked` and recalculate `expiresAt` to 365 days after the booking completion timestamp in the same write operation; sessions with `status: 'booked'` SHALL be exempt from the 48-hour inactivity archiving rule. THE system SHALL NOT allow `status` to be set to `booked` except when a booking is actually completed via the booking workflow.

---

### Requirement 6: Conversation Hydration

**User Story:** As a returning visitor, I want the chat widget to visually restore my prior messages and continue from where I left off, so that the experience feels continuous.

#### Acceptance Criteria

1. WHEN the widget opens and a valid `Widget_Session` is found in `localStorage`, THE Widget SHALL call `GET /session/:widgetSessionId` before rendering any message.
2. WHEN `GET /session/:widgetSessionId` returns a valid session, THE Widget SHALL display the last 10 messages from `history` as prior messages and set the conversation `stage` to the returned value.
3. WHEN `GET /session/:widgetSessionId` returns HTTP 404 or HTTP 410, THE Widget SHALL discard the stale `Widget_Session` from `localStorage`, create a new session via `POST /session`, and begin a fresh greeting.
4. WHEN `GET /session/:widgetSessionId` returns any HTTP 5xx error, THE Widget SHALL display a recovery greeting without deleting the local session, allowing the next open to retry.
5. THE Widget SHALL display a visual indicator (e.g., "Continuing your conversation…") during the hydration loading period before messages are rendered.
6. WHEN the widget opens and a valid `Widget_Session` is being resumed, THE Widget SHALL NOT send the `__init__` sentinel — this restriction applies whenever a session is being resumed, regardless of `turnCount` value, session error state, or whether the session is subsequently discarded.
7. WHEN resuming a session, THE Widget SHALL wait for both the `GET /session/:widgetSessionId` API response to return and the session data to be validated before rendering any prior messages or sending any sentinel message.

---

### Requirement 7: Returning Visitor AI Behaviour

**User Story:** As a returning visitor, I want the AI to acknowledge that we have spoken before and to skip fields it already knows, so that I do not repeat information I have already provided.

#### Acceptance Criteria

1. WHEN a returning visitor resumes a session and `memory.visitorName` is non-null, THE Orchestrator SHALL include the stored name in the opening context and SHALL NOT ask for the visitor's name again.
2. WHEN a returning visitor resumes a session, THE Orchestrator SHALL use the hydrated `RichConversationMemory` to skip any `ConversationProgress` field already marked `true`.
3. WHEN a session is resumed with `turnCount` greater than 0, THE Widget SHALL send a synthetic `__resume__` message (instead of `__init__`) as the first turn so the Orchestrator generates a resumption greeting rather than a new visitor greeting; this rule applies unconditionally regardless of whether the widget was restarted, reloaded, or reopened after a page navigation.
4. WHEN the `__resume__` message is received and `memory.visitorName` is non-null, THE Orchestrator SHALL generate a personalized resumption greeting that includes the visitor's name and references the prior topic if available in `memory`.
5. WHEN the `__resume__` message is received and `memory.visitorName` is null, THE Orchestrator SHALL generate a generic resumption greeting without fabricating a name.

---

### Requirement 8: Frontend Hook Refactor

**User Story:** As a developer, I want `useConversation` to manage session lifecycle through well-defined methods, so that session creation, resumption, and hydration are testable and maintainable.

#### Acceptance Criteria

1. THE useConversation Hook SHALL expose the following methods in addition to its existing API: `createSession()`, `loadSession(widgetSessionId)`, `resumeSession(sessionData)`, `hydrateConversation(history, stage, memory)`.
2. THE useConversation Hook SHALL call `widgetApiClient.createSession()` when `createSession()` is invoked and SHALL store the returned `widgetSessionId` and `conversationId` in both React state and `localStorage` only if the API call succeeds — no storage update shall occur on API failure.
3. THE useConversation Hook SHALL call `widgetApiClient.getSession()` when `loadSession()` is invoked and SHALL return the session payload or null on 404/410.
4. THE useConversation Hook SHALL preserve all existing method signatures (`sendMessage`, `initConversation`, `resetConversation`) so that `ChatWidget.tsx` and all other components require no changes.
5. WHEN `resetConversation()` is called, THE useConversation Hook SHALL clear the `localStorage` entry for the current session and call `createSession()` to obtain a fresh `widgetSessionId` and `conversationId`; if either the `localStorage` clear or the `createSession()` API call fails, THE useConversation Hook SHALL fail the entire `resetConversation()` operation and leave the session state unchanged — no partial state (cleared storage without a new session, or a new session without cleared storage) shall be persisted. `localStorage` clearing and session creation that occur outside of `resetConversation()` (e.g., via direct calls or unrelated code paths) are not subject to this atomicity constraint.

---

### Requirement 9: CRM Memory Enrichment

**User Story:** As a sales operator, I want the lead record created during booking to contain the full AI-collected memory, so that my team has complete context without reading the chat transcript.

#### Acceptance Criteria

1. WHEN `widgetBook()` completes successfully and a `conversationId` is present, THE widgetBook Controller SHALL copy the `RichConversationMemory` from the `AIConversationSession` document into the created `Lead` record.
2. THE widgetBook Controller SHALL map the following memory fields to Lead fields: `memory.visitorName` → `lead.name` (if not already set from form), `memory.phone` → `lead.phone` (if not already set), `memory.rich.address.value` → `lead.address`, `memory.rich.zip.value` → `lead.zipCode`, `memory.rich.service.value` → `lead.hvacNeed`, `memory.rich.emergency.value` → `lead.emergency`, `memory.summary` → `lead.notes` (appended). This field mapping SHALL always be performed when booking completes, regardless of whether the memory copying step in criterion 1 succeeded.
3. IF the `AIConversationSession` is not found for the given `conversationId`, THEN THE widgetBook Controller SHALL log a warning event for monitoring purposes, proceed with booking using only the form data, and SHALL NOT raise an error or reject the booking.
4. THE widgetBook Controller SHALL NOT overwrite a Lead field that already carries a non-empty value from the form submission. This protection applies at all times — any update path that touches Lead fields SHALL enforce the non-overwrite constraint regardless of whether it is triggered by memory copying or another operation.
5. WHEN memory is copied to the Lead, THE AIConversationSession SHALL set `status` to `booked`.

---

### Requirement 10: Session Expiry Management

**User Story:** As the platform operator, I want stale sessions to be automatically cleaned up, so that MongoDB storage does not grow unboundedly while booked sessions are retained for audit.

#### Acceptance Criteria

1. WHEN a background job runs and an `AIConversationSession` has `status: 'active'` and `lastActivity` more than 48 hours ago, THE Session_Expiry_Job SHALL set `status` to `archived`.
2. WHEN a background job runs and an `AIConversationSession` has `status: 'archived'` and `lastActivity` more than 30 days ago, THE Session_Expiry_Job SHALL permanently delete the document.
3. THE Session_Expiry_Job SHALL NOT archive or delete any `AIConversationSession` with `status: 'booked'`, regardless of `lastActivity` age.
4. THE Session_Expiry_Job SHALL run on a configurable interval with a default of every 60 minutes.
5. IF the Session_Expiry_Job encounters a database error during a batch operation, THEN THE Session_Expiry_Job SHALL log the error and continue processing remaining documents without terminating the job.

---

### Requirement 11: Security — Server-Side Identity

**User Story:** As the platform, I want all session and conversation identifiers to be generated server-side, so that clients cannot forge or enumerate sessions belonging to other organizations.

#### Acceptance Criteria

1. THE Session_API SHALL reject any `POST /session` request whose body contains a `widgetSessionId` or `conversationId` field — the server SHALL generate both values unconditionally; request properties outside the body (e.g., headers, path parameters) are not subject to this restriction.
2. WHEN a `GET /session/:widgetSessionId` or `DELETE /session/:widgetSessionId` request is received, THE Session_API SHALL verify that the session's `organizationId` matches the `organizationId` resolved from the `:token` parameter; IF they do not match, THE Session_API SHALL return HTTP 404.
3. THE Session_API SHALL never include MongoDB `_id`, `organizationId`, or internal document fields in any response body.
4. THE Session_API SHALL validate that `:widgetSessionId` matches the UUID v4 pattern before querying MongoDB; IF the format is invalid, THE Session_API SHALL return HTTP 422 without querying the database.
5. WHILE a `widgetSessionId` lookup is in flight, THE Session_API SHALL use the compound index `{ widgetSessionId: 1, organizationId: 1 }` to prevent cross-tenant data access.

---

### Requirement 12: Error Recovery

**User Story:** As a visitor, I want the widget to gracefully recover from session errors without crashing or displaying a blank screen, so that I can always reach the AI even when something goes wrong.

#### Acceptance Criteria

1. WHEN any session API call returns an unexpected HTTP 5xx error during widget initialisation, THE Widget SHALL display a fresh greeting and create a new in-memory session without surfacing a technical error to the visitor.
2. WHEN two browser tabs open the widget simultaneously for the same `Widget_Session` and one tab receives a `SESSION_NOT_FOUND` error, THE Widget in that tab SHALL silently create a new session rather than showing an error.
3. IF `localStorage` throws a `QuotaExceededError`, THEN THE Widget SHALL log the event, permanently switch to in-memory session storage for the remainder of the current page session, and continue operating normally without retrying `localStorage` writes.
4. WHEN the `widgetBook()` endpoint returns an error, THE Widget SHALL preserve all conversation context (messages, stage, memory) regardless of whether a `widgetSessionId` exists in local storage.
5. THE Widget SHALL surface at most one user-visible error message per error event — no cascading error dialogs; when multiple independent errors occur simultaneously, THE Widget SHALL display a single consolidated error message rather than one message per error.

---

### Requirement 13: Analytics Instrumentation

**User Story:** As a product analyst, I want structured events emitted for every session lifecycle transition, so that I can measure session creation, resumption, expiry, and returning-visitor rates.

#### Acceptance Criteria

1. WHEN a new session is created via `POST /session`, THE Session_API SHALL emit an Analytics_Event of type `session_created` containing `widgetSessionId`, `organizationId`, and `source: 'widget'`.
2. WHEN a session is successfully resumed via `GET /session/:id` with `turnCount` greater than 0, THE Session_API SHALL emit an Analytics_Event of type `session_resumed` containing `widgetSessionId`, `turnCount`, and `lastActivity`.
3. WHEN the Session_Expiry_Job archives a session, THE Session_Expiry_Job SHALL emit an Analytics_Event of type `session_expired` containing `widgetSessionId` and `lastActivity`. This event SHALL be emitted for all archived sessions including those that were created but had no user interaction (turnCount of 0).
4. WHEN the `__resume__` sentinel is processed by the Orchestrator and `memory.visitorName` is non-null, THE Orchestrator SHALL emit an Analytics_Event of type `returning_visitor` containing `widgetSessionId` and `turnCount`.
5. THE Analytics events described in criteria 1–4 SHALL be persisted via the existing `persistEvents()` function without introducing a new persistence mechanism.

---

### Requirement 14: Backward Compatibility

**User Story:** As a developer, I want all existing endpoints, function signatures, and MongoDB documents to continue working after this feature is deployed, so that nothing currently in production is broken.

#### Acceptance Criteria

1. THE runOrchestrator Function SHALL accept the same `OrchestratorInput` shape and return the same `OrchestratorOutput` shape as defined in `ai/types.ts` — no parameters shall be removed or made required that were previously optional.
2. THE widgetChat Endpoint SHALL continue to accept `{ message, conversationId, currentPage }` and return `{ reply, stage, bookingTriggered }` — the response schema shall not change.
3. THE widgetBook Endpoint SHALL continue to accept the existing `WidgetBookSchema` fields and return the existing confirmation payload — no field shall be removed.
4. ALL existing `AIConversationSession` documents in MongoDB without `widgetSessionId`, `status`, `expiresAt`, `progress`, or `plan` fields SHALL remain readable and processable by the system after the schema upgrade.
5. THE AIConversationSession Schema upgrade SHALL use additive-only Mongoose schema changes with default values and optional types so that no migration script is required for existing documents.
6. THE ChatWidget Component, ChatWindow Component, ChatBubble Component, ChatInput Component, SlotPicker Component, and BookingConfirmationCard Component SHALL require no code changes as a result of this feature.
