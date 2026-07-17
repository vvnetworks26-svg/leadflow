# Requirements Document

## Introduction

This sprint audits and hardens the end-to-end booking pipeline for LeadFlow, an AI-powered HVAC lead-capture and appointment-booking SaaS. The pipeline spans: Landing Page → Chat Widget → Lead creation → Conversation creation → Appointment creation → Dashboard display.

The goal is production-grade reliability and data consistency — not UI redesign or new features. Specifically:

- Every entity (Lead, Conversation, Appointment) must be created atomically and cross-linked.
- Duplicate bookings caused by double-clicks, network retries, or repeated API calls must be prevented.
- Confirmation numbers must be unique and cryptographically generated on the backend.
- Timezone handling must be unambiguous (store in UTC/IANA, display in business timezone).
- Transaction integrity must be guaranteed across the three-entity creation sequence.
- The Dashboard must reflect accurate appointment counts and statuses immediately.

No changes to the UI design or navigation structure are in scope. All changes are confined to reliability, consistency, and correctness of the data layer and API.

---

## Glossary

- **Widget**: The embeddable public chat interface (`/api/v1/widget/:token/*`) that captures visitor information and books appointments without authentication.
- **Lead**: A `Lead` document in MongoDB representing a prospective customer.
- **Conversation**: A `Conversation` document that records the full chat transcript linked to a Lead.
- **Appointment**: An `Appointment` document representing a scheduled service visit linked to a Lead and Conversation.
- **Booking_Flow**: The complete sequence — resolve org → create Conversation → create Lead → generate confirmation number → create Appointment → back-link appointmentId on Lead.
- **Confirmation_Number**: A unique, server-generated alphanumeric identifier returned to the visitor after a successful booking (format: `LF-` followed by exactly 6 uppercase hexadecimal characters).
- **Idempotency_Key**: A client-supplied string (sent in the `Idempotency-Key` HTTP header) that allows the server to detect and safely deduplicate repeated identical requests.
- **Atomic_Booking**: A booking where all three entities (Lead, Conversation, Appointment) are either all created and linked successfully or none persist — no orphan records are left behind.
- **Orphan_Record**: A Lead, Conversation, or Appointment that was created but is missing its expected cross-links (e.g., a Lead without an `appointmentId` after the flow completes).
- **UTC_Normalization**: The practice of storing all datetime values in UTC and converting to the organization's IANA timezone only for display.
- **Cross_Link**: The bidirectional references between entities — Appointment.leadId → Lead._id, Appointment.conversationId → Conversation._id, Lead.appointmentId → Appointment._id, Conversation.appointmentId → Appointment._id (where applicable).
- **Dashboard**: The authenticated frontend pages (Overview, Leads, Appointments, Conversations) that display booking data to the business owner.
- **BookingService**: The `apps/api/src/calendar/bookings/BookingService.ts` module used by authenticated calendar booking flows.
- **AppointmentService**: The `apps/api/src/services/AppointmentService.ts` module used by both the widget endpoint and the authenticated `/appointments` route.
- **WidgetController**: The `apps/api/src/controllers/widgetController.ts` module that handles all public `POST /api/v1/widget/:token/book` requests.
- **AuditService**: The server-side service that persists structured audit events to MongoDB for post-hoc investigation.
- **IANA_Timezone**: A timezone identifier from the IANA Time Zone Database (e.g., `America/New_York`, `America/Chicago`) stored on the Organization document as `timezone`.

---

## Requirements

### Requirement 1: Atomic Booking Workflow

**User Story:** As a business owner, I want every booking submitted through the widget to create a fully linked Lead, Conversation, and Appointment, so that no orphan records ever appear in my Dashboard.

#### Acceptance Criteria

1. WHEN a widget booking request completes successfully, THE Booking_Flow SHALL persist exactly one Lead, one Conversation, and one Appointment, each containing the IDs of the other two entities in their respective reference fields.
2. IF any step in the Booking_Flow fails after one or more entities have already been persisted, THEN THE Booking_Flow SHALL delete all entities created during that request before returning an HTTP 500 error response.
3. WHEN the Booking_Flow returns HTTP 201, THE system SHALL guarantee that all three entities (Lead, Conversation, Appointment) exist in the database with all Cross_Links populated — no partial state SHALL be observable by any subsequent read.
4. WHEN the Booking_Flow completes, THE Appointment SHALL contain a `leadId` equal to the newly created Lead's `_id` and a `conversationId` equal to the newly created Conversation's `_id`.
5. WHEN the Booking_Flow completes, THE Lead SHALL contain an `appointmentId` equal to the newly created Appointment's `_id` and a `conversationId` equal to the newly created Conversation's `_id`.
6. WHEN the Booking_Flow completes, THE Conversation SHALL contain a `leadId` equal to the newly created Lead's `_id` and an `appointmentId` equal to the newly created Appointment's `_id`.
7. IF the compensating delete of a partially created entity itself fails, THEN THE Booking_Flow SHALL emit a structured error log entry that includes the IDs of any entities that could not be deleted, and SHALL still return an HTTP 500 error to the caller.

### Requirement 2: Duplicate Booking Prevention

**User Story:** As a business owner, I want the system to prevent duplicate appointments from double-clicks or repeated API calls, so that a customer never receives two confirmation numbers for the same booking.

#### Acceptance Criteria

1. WHEN a widget booking request includes an `Idempotency-Key` header whose value matches a previously completed booking for the same organization, THE WidgetController SHALL return HTTP 200 with the original confirmation response body, without creating any new Lead, Conversation, or Appointment documents.
2. WHEN an idempotency cache hit is detected, THE WidgetController SHALL serve the cached response if the original request completed within the preceding 24 hours; IF the cached entry is older than 24 hours, THE WidgetController SHALL treat the request as a new booking.
3. WHEN two widget booking requests for the same organization, same `date`, same `time`, and same `phone` number are received and both pass idempotency checks, THE Booking_Flow SHALL permit exactly one to succeed with HTTP 201 and SHALL return HTTP 409 with error code `DUPLICATE_BOOKING` to the other.
4. THE AppointmentModel SHALL declare a unique compound index on `{ organizationId, date, time, leadPhone }` so that the database layer rejects a second insert with the same combination as a duplicate key error, which the Booking_Flow SHALL surface as HTTP 409.
5. WHEN the WidgetController returns a cached idempotency response (HTTP 200), THE system SHALL NOT invoke `AutomationService.fire`, write to the AuditService, or create any activity log entry for that duplicate request.

### Requirement 3: Confirmation Number Integrity

**User Story:** As a visitor, I want to receive a unique confirmation number after booking so that I can reference my appointment, and as a business owner, I want that number to be globally unique and tamper-proof.

#### Acceptance Criteria

1. THE Booking_Flow SHALL generate every Confirmation_Number from a cryptographically unpredictable source such that the output is statistically indistinguishable from a uniformly random selection over the output space; use of `Math.random()` or any non-CSPRNG source is prohibited.
2. THE Confirmation_Number SHALL match the regular expression `/^LF-[0-9A-F]{6}$/` — the prefix `LF-` followed by exactly 6 uppercase hexadecimal characters.
3. THE AppointmentModel SHALL declare a sparse unique index on the `confirmationNumber` field so that two Appointment documents with the same non-null `confirmationNumber` value cannot coexist in the database.
4. IF an Appointment insert is rejected with a duplicate key error on `confirmationNumber`, THEN THE Booking_Flow SHALL regenerate a new Confirmation_Number and retry the insert; this retry SHALL occur up to 3 times before the Booking_Flow abandons the attempt, deletes any Lead and Conversation already created for this request, and returns HTTP 500.
5. WHEN the Booking_Flow returns HTTP 201, THE response body SHALL include a top-level field `confirmationNumber` whose value is the Confirmation_Number assigned to the created Appointment.
6. WHEN the widget frontend receives a successful booking API response, THE frontend SHALL display the `confirmationNumber` value from the API response body; THE frontend SHALL NOT generate or display any locally computed confirmation identifier.

### Requirement 4: Timezone Handling

**User Story:** As a business owner in any US timezone, I want appointment times to be stored unambiguously and displayed correctly in my local timezone, so that technicians never arrive at the wrong time.

#### Acceptance Criteria

1. THE AppointmentService SHALL store the `date` field as a `YYYY-MM-DD` string and the `time` field as an `HH:MM` (24-hour) string, both interpreted in the organization's IANA_Timezone — not as UTC timestamps and not as UTC-offset strings.
2. THE Booking_Flow SHALL persist the organization's IANA_Timezone identifier in the `timezone` field of every newly created Appointment document, so that the stored `date` and `time` can be unambiguously converted to UTC by any downstream consumer without querying the Organization record.
3. IF the `Business.timezone` field is absent or does not contain a valid IANA_Timezone identifier at booking time, THEN THE Booking_Flow SHALL reject the booking with HTTP 422 and error code `INVALID_TIMEZONE` rather than defaulting to server-local time or UTC.
4. THE Dashboard SHALL render appointment times using `Intl.DateTimeFormat` with the organization's IANA_Timezone identifier; hardcoded UTC-offset arithmetic (e.g., `getUTCHours() - 5`) SHALL NOT be used anywhere in the display layer.
5. WHEN a booking request includes a `guestTimezone` field, THE Booking_Flow SHALL store the `guestTimezone` value on the Appointment document as an informational field; THE appointment `date` and `time` fields SHALL always reflect the slot in the business's IANA_Timezone regardless of the visitor's timezone.
6. IF a `guestTimezone` value is supplied but is not a valid IANA_Timezone identifier, THEN THE Booking_Flow SHALL store the value as-is and SHALL NOT reject or fail the booking on account of the invalid guest timezone.
7. THE TimezoneService `localToUtc` function SHALL produce results such that for any valid IANA_Timezone `tz` and any UTC instant `t`, `localToUtc(utcToLocal(t, tz), tz)` returns a UTC value within ±1 minute of `t`, including during DST spring-forward and fall-back transitions.

### Requirement 5: Transaction Integrity Across Entity Creation

**User Story:** As a business owner, I want to be confident that every record in the database is in a consistent state, so that the Dashboard never shows partial or mislinked data.

#### Acceptance Criteria

1. IF the Appointment creation step (step 5) fails after the Lead (step 3) and Conversation (step 2) have already been persisted, THEN THE Booking_Flow SHALL issue delete operations for the newly created Lead and Conversation and SHALL return HTTP 500 to the caller once the cleanup is attempted.
2. WHEN the Lead back-link update (step 6, setting `Lead.appointmentId`) fails on the first attempt, THE Booking_Flow SHALL retry the update exactly once before proceeding.
3. IF the Lead back-link update fails on both the initial attempt and the single retry, THEN THE Booking_Flow SHALL emit a structured error log entry containing the Lead ID and Appointment ID, and SHALL still return HTTP 201 to the caller (since all primary entities are persisted and linked via the Appointment's fields).
4. THE Booking_Flow SHALL await the Lead back-link update before returning HTTP 201; fire-and-forget patterns (e.g., `.catch(() => {})` without awaiting) SHALL NOT be used for the back-link step.
5. WHEN the WidgetController receives a valid booking request, THE WidgetController SHALL execute the Booking_Flow steps in the following strict order: (1) resolve organization, (2) create or retrieve Conversation, (3) create Lead, (4) generate Confirmation_Number, (5) create Appointment, (6) await Lead back-link update, (7) return HTTP 201.
6. THE Booking_Flow SHALL produce exactly one Appointment document per successful booking request; no request-handling path SHALL result in two or more Appointment documents sharing the same `leadId` from a single invocation.

### Requirement 6: Dashboard Data Accuracy

**User Story:** As a business owner, I want the Dashboard to show accurate appointment counts, lead counts, and recent activity immediately after a booking completes, so that I can monitor my pipeline in real time.

#### Acceptance Criteria

1. WHEN a new Appointment with status `Confirmed` or `Scheduled` is created via the Booking_Flow, THE Dashboard overview count (derived from `AppointmentModel.countDocuments({ organizationId, status: { $in: ['Confirmed','Scheduled'] } })`) SHALL reflect the incremented count within 30 seconds of the booking completing, assuming the Dashboard is reloaded within that window.
2. WHEN a Lead is created via the Booking_Flow, THE Dashboard lead list SHALL include the new Lead with `status` equal to `New`, `source` equal to `widget`, and `appointmentId` populated with the created Appointment's ID.
3. WHEN the Booking_Flow completes, THE Conversation document SHALL have its `status` field set to `completed` and its `appointmentId` field set to the created Appointment's `_id`.
4. THE AppointmentService `list` method SHALL always include `organizationId` as a required filter condition; no query path SHALL return Appointment documents from more than one `organizationId` in a single response.
5. WHEN the Dashboard fetches the appointment list without an explicit sort parameter, THE AppointmentService SHALL return appointments sorted by `date` descending with `createdAt` descending as a tiebreaker, so that appointments on the same date are ordered with the most recently created first.

### Requirement 7: Widget Endpoint Security and Rate Limiting

**User Story:** As a business owner, I want the public widget booking endpoint to be protected against abuse and spam submissions, so that my database is not polluted with fake leads.

#### Acceptance Criteria

1. THE WidgetController SHALL execute `WidgetBookSchema.safeParse(req.body)` as the first operation inside `widgetBook` before any database read or write is performed; IF parsing fails, THE handler SHALL return the error response immediately without touching MongoDB.
2. WHEN `WidgetBookSchema` validation fails, THE WidgetController SHALL return HTTP 422 with a JSON body of the form `{ status: 'error', code: 'VALIDATION_ERROR', errors: [{ field: string, message: string }] }`, where `errors` contains one entry per invalid field.
3. WHEN a client IP exceeds 60 requests within any rolling 15-minute window across all `/api/v1/widget/:token/*` routes, THE rate-limiter middleware SHALL return HTTP 429 with `{ status: 'error', code: 'RATE_LIMITED' }` for all subsequent requests from that IP until the window resets.
4. WHEN a request arrives at any widget endpoint and the `:token` path parameter does not match any Organization document with `status: 'active'`, THE WidgetController SHALL return HTTP 404 with error code `ORG_NOT_FOUND` without performing any MongoDB write operation.
5. THE WidgetController SHALL derive `organizationId` exclusively from the Organization document resolved via the `:token` path parameter; any `organizationId` field present in the request body SHALL be silently ignored and SHALL NOT influence which organization's records are created or queried.

### Requirement 8: Booking Audit Trail

**User Story:** As a business owner, I want every booking event to be logged in the audit trail, so that I can investigate disputes or data inconsistencies after the fact.

#### Acceptance Criteria

1. WHEN a Booking_Flow completes successfully, THE application logger SHALL emit a structured log entry at `info` level containing the fields: `organizationId`, `leadId`, `appointmentId`, `conversationId`, `confirmationNumber`, and `timestamp` (ISO 8601 UTC string).
2. WHEN the Booking_Flow fails at any step, THE application logger SHALL emit a structured log entry at `error` level containing: `organizationId`, `step` (one of: `resolve-org`, `create-conversation`, `create-lead`, `generate-confirmation`, `create-appointment`, `backlink-lead`), `errorMessage`, and the IDs of any entities successfully created before the failure.
3. WHEN the Booking_Flow completes successfully, THE AuditService SHALL persist a non-blocking `booking_created` event record containing `organizationId`, `leadId`, `appointmentId`, and `conversationId`; a write failure in AuditService SHALL NOT cause the booking HTTP response to fail.
4. WHEN the WidgetController detects an idempotency cache hit and returns a cached response, THE application logger SHALL emit a structured log entry at `info` level containing: `idempotencyKey`, `originalConfirmationNumber`, `organizationId`, and `timestamp` (ISO 8601 UTC string).

### Requirement 9: Concurrent Booking Protection

**User Story:** As a business owner, I want the system to guarantee that identical booking requests processed simultaneously across multiple backend instances never produce more than one appointment, so that my database remains consistent even under concurrent load.

#### Acceptance Criteria

1. WHEN N concurrent widget booking requests (N ≥ 2) arrive for the same `organizationId`, `date`, `time`, and `leadPhone` values and all pass idempotency and validation checks, THE Booking_Flow SHALL persist exactly one Appointment, one Lead, and one Conversation to the database — regardless of the number of concurrent requests or the number of running application instances.
2. WHEN a concurrent booking request is rejected because an Appointment with the same `{ organizationId, date, time, leadPhone }` already exists, THE WidgetController SHALL return HTTP 409 with a JSON body of the form `{ status: 'error', code: 'DUPLICATE_BOOKING', appointmentId: string, confirmationNumber: string }`, where `appointmentId` and `confirmationNumber` are taken from the already-persisted Appointment.
3. WHEN a concurrent booking request is rejected with HTTP 409, THE Booking_Flow SHALL delete any Lead or Conversation documents that were created for that request before the duplicate was detected, so that no Orphan_Record exists in the database after the rejection completes.
4. IF the compensating delete of an orphan Lead or Conversation created by a losing concurrent request fails, THEN THE Booking_Flow SHALL emit a structured error log entry containing the IDs of the documents that could not be deleted and SHALL still return HTTP 409 to the caller.
5. THE duplicate detection mechanism SHALL be enforced at the MongoDB layer via the unique compound index on `{ organizationId, date, time, leadPhone }` declared on the AppointmentModel, so that the constraint is upheld regardless of which application instance processes each request and without relying on any in-memory lock, mutex, or singleton.
6. WHEN 10 concurrent widget booking requests for the same slot are submitted to the system under load-test conditions, THE database SHALL contain exactly 1 Appointment, at most 1 Lead, and at most 1 Conversation for that slot after all requests have completed, with the remaining 9 requests having received HTTP 409 responses.
7. WHEN a concurrent booking request is rejected with HTTP 409, THE system SHALL NOT invoke `AutomationService.fire`, write to the AuditService, or create any activity log entry for that rejected request.

### Requirement 10: Booking Observability & Diagnostics

**User Story:** As an on-call engineer, I want every booking request to produce a complete, correlated structured log trail so that I can diagnose any production issue using only the Request ID without querying the database directly.

#### Acceptance Criteria

1. WHEN `widgetBook` emits any log entry, THE entry SHALL be written using the per-request child logger `req.logger` (the Pino child bound to `{ requestId }` by the `requestId` middleware) so that every log line produced during a single booking request carries an identical `requestId` field.

2. WHEN `widgetBook` reaches each of the following lifecycle points, THE handler SHALL emit a structured log entry at `info` level using `req.logger`, where each entry includes at minimum the fields `requestId`, `organizationId` (once resolved), `event`, and `timestamp` (ISO 8601 UTC string), plus any entity IDs available at that point:
   - `booking.started` — emitted after `WidgetBookSchema` validation passes; includes no entity IDs yet
   - `booking.validation_completed` — emitted immediately after successful schema parse; includes `phone` and `date` and `time` from the validated input (no PII beyond what is already in the booking request body)
   - `booking.conversation_created` — emitted after `ConversationService.create` returns; includes `conversationId`
   - `booking.lead_created` — emitted after `LeadService.create` returns; includes `leadId` and `conversationId`
   - `booking.appointment_created` — emitted after `AppointmentService.create` returns; includes `appointmentId`, `leadId`, `conversationId`, and `confirmationNumber`
   - `booking.completed` — emitted immediately before `res.status(201)` is sent; includes `appointmentId`, `leadId`, `conversationId`, and `confirmationNumber`

3. WHEN `widgetBook` catches an error at any step, THE handler SHALL emit a structured log entry at `error` level using `req.logger` containing the following fields: `requestId`, `organizationId` (if resolved), `event` (value: `booking.failed`), `step` (one of: `resolve-org`, `validate-timezone`, `idempotency-check`, `create-conversation`, `create-lead`, `generate-confirmation`, `create-appointment`, `backlink-lead`, `crosslink-conversation`), `errorMessage` (the `Error.message` string), `stack` (the `Error.stack` string — server-side only, never sent to the client), `leadId` (if created), `appointmentId` (if created), `conversationId` (if created), and `timestamp` (ISO 8601 UTC string).

4. IF a call to `req.logger.info` or `req.logger.error` itself throws an exception, THEN the `widgetBook` handler SHALL continue execution and SHALL NOT alter the HTTP response status or body on account of the logging failure.

5. THE Pino logger redaction configuration SHALL include `'*.widgetToken'` and `'*.token'` path patterns (in addition to the existing redacted fields) so that the widget `:token` path parameter is replaced with `[Redacted]` if it is ever inadvertently included in a log entry's metadata object; existing redaction paths for `authorization`, `password`, `passwordHash`, `accessToken`, `refreshToken`, and `cookie` SHALL remain in place.

6. THE `widgetBook` handler SHALL NOT log the raw request body (`req.body`) or the raw `Idempotency-Key` header value at any log level; only the structured fields explicitly listed in criteria 2 and 3 above SHALL be included in booking log entries.

7. WHEN a `booking.failed` log entry is emitted, THE `stack` field SHALL contain the JavaScript stack trace string from the caught `Error` object; IF the caught value is not an `Error` instance, THE `stack` field SHALL be set to `null`.

### Requirement 11: Booking Performance & Reliability

**User Story:** As a business owner, I want the booking API to respond within defined latency bounds under normal production load and to enforce a maximum request timeout, so that visitors are never left waiting indefinitely; and as an on-call engineer, I want structured performance signals in logs so that I can detect degradation before it affects customers.

#### Acceptance Criteria

1. WHEN `POST /api/v1/widget/:token/book` is exercised under a load-test condition of 30 simultaneous requests sustained for 60 seconds against a single running instance with a healthy MongoDB Atlas connection, THE 95th-percentile end-to-end response time (from Express receipt to response sent, as recorded in the `durationMs` field of the `request completed` log entry) SHALL be ≤ 2000ms.

2. WHEN the same load-test condition from criterion 1 is applied, THE 99th-percentile `durationMs` value across all `request completed` log entries for `POST` requests to paths matching `/api/v1/widget/*/book` SHALL be ≤ 4000ms.

3. WHEN a `POST /api/v1/widget/:token/book` request has been processing for 10000ms without the handler sending a response, THE server SHALL abort the handler, respond with HTTP 503 and JSON body `{ status: 'error', code: 'REQUEST_TIMEOUT' }`, and emit a `booking.timeout` log entry (see criterion 7); IF any Lead or Conversation was created before the timeout, THE Booking_Flow SHALL attempt to delete those entities using the same compensating-cleanup logic specified in Requirement 1.2, logging any cleanup failures per Requirement 1.7.

4. THE `widgetBook` handler SHALL NOT issue a MongoDB `findOne`, `findById`, or equivalent read operation to re-fetch a Lead or Appointment document whose complete data was already returned by the immediately preceding `LeadService.create` or `AppointmentService.create` call within the same request; the return value of the creation call SHALL be used directly.

5. WHEN the `request completed` log entry is emitted by the `requestId` middleware for a `POST` request to a path matching `/api/v1/widget/*/book`, THE entry SHALL include a `durationMs` field containing the elapsed milliseconds from request receipt to response sent, rounded to two decimal places, so that the `durationMs` values for booking requests can be extracted and used to compute P95 and P99 latency percentiles.

6. WHEN a booking request is aborted due to the 10-second timeout (criterion 3), THE `widgetBook` handler SHALL emit a structured log entry at `error` level via `req.logger` with the following fields: `event` (value: `booking.timeout`), `requestId`, `organizationId` (if resolved at timeout), `leadId` (if created before timeout), `conversationId` (if created before timeout), `durationMs` (elapsed milliseconds at the point of timeout), and `timestamp` (ISO 8601 UTC string).

7. THE structured log entries emitted during the booking lifecycle SHALL collectively provide observable signals for the following performance and reliability dimensions, queryable by filtering on the named `event` field values:
   - **Booking latency** — via `durationMs` on `request completed` entries where `path` matches `/api/v1/widget/*/book`
   - **Failed bookings** — via `event: 'booking.failed'` entries (defined in Requirement 10.3)
   - **Duplicate booking attempts** — via `event: 'booking.idempotency_hit'` (idempotency cache hits, Requirement 10 criterion 4 log) and `code: 'DUPLICATE_BOOKING'` on `request completed` entries with `status: 409`
   - **Transaction rollbacks (compensating cleanups)** — via `event: 'booking.failed'` entries that include at least one of `leadId` or `conversationId` fields, indicating entities existed before the failure
   - **Timeout events** — via `event: 'booking.timeout'` entries (criterion 6 above)
