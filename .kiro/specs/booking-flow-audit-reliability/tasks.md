# Implementation Plan: Sprint 1.1 — Booking Flow Audit & Reliability

## Overview

Tasks are ordered by dependency. Each task maps to one or more requirements and modifies specific files identified in the design. Complete tasks in order — later tasks depend on earlier ones.

---

## Tasks

- [ ] 1. Add `extra` payload to `ApiError` class
  - Open `apps/api/src/middleware/errorHandler.ts`
  - Add optional `extra?: Record<string, unknown>` parameter to the `ApiError` constructor
  - Store it as `public readonly extra`
  - No changes to `errorHandler` or `notFoundHandler` functions
  - **Requirement:** 9.2
  - **File:** `apps/api/src/middleware/errorHandler.ts`

- [ ] 2. Create `generateConfirmationNumber` utility
  - Create `apps/api/src/utils/confirmationNumber.ts`
  - Export `generateConfirmationNumber(): string` using `crypto.randomBytes(3).toString('hex').toUpperCase()` prefixed with `LF-`
  - Result must match `/^LF-[0-9A-F]{6}$/`
  - **Requirement:** 3.1, 3.2
  - **File:** `apps/api/src/utils/confirmationNumber.ts` (new)

- [ ] 3. Create `IdempotencyCache` utility
  - Create `apps/api/src/utils/IdempotencyCache.ts`
  - Implement a `BookingConfirmationResponse` interface with fields: `appointmentId`, `confirmationNumber`, `conversationId`, `leadId`, `customerName`, `service`, `date`, `time`, `displayDate`, `displayTime`, `estimatedDuration`, `address`
  - Implement `IdempotencyCache` class with a private `Map<string, { response: BookingConfirmationResponse; createdAt: Date }>`
  - TTL is exactly 24 hours (86_400_000 ms)
  - `get(key: string)`: return `null` if missing or expired; remove expired entry on read
  - `set(key: string, response: BookingConfirmationResponse)`: store entry with current timestamp; call private `evict()` to remove all stale entries
  - `evict()`: iterate map and delete all entries where `Date.now() - createdAt.getTime() > TTL_MS`
  - Export a singleton `idempotencyCache` instance
  - **Requirement:** 2.1, 2.2
  - **File:** `apps/api/src/utils/IdempotencyCache.ts` (new)

- [ ] 4. Extend `AuditLog` model with booking event types
  - Open `apps/api/src/models/AuditLog.model.ts`
  - Add `BOOKING_CREATED = 'booking_created'` and `BOOKING_DUPLICATE = 'booking_duplicate'` to the `AuditEvent` enum
  - Add both values to the `EVENT_SEVERITY` map with severity `'info'`
  - No schema changes — existing fields are sufficient
  - **Requirement:** 8.3
  - **File:** `apps/api/src/models/AuditLog.model.ts`

- [ ] 5. Add `logBookingCreated` and `logBookingDuplicate` helpers to `AuditService`
  - Open `apps/api/src/services/AuditService.ts`
  - Add `logBookingCreated(ctx: { organizationId, leadId, appointmentId, conversationId, confirmationNumber, ipAddress? }): void` — calls `AuditService.log` with `event: AuditEvent.BOOKING_CREATED`, `category: AuditCategory.AUTH` (reuse existing category), fire-and-forget
  - Add `logBookingDuplicate(ctx: { organizationId, idempotencyKey, confirmationNumber, ipAddress? }): void` — calls `AuditService.log` with `event: AuditEvent.BOOKING_DUPLICATE`, same pattern
  - Both methods must be non-blocking and must not throw
  - **Requirement:** 8.3, 8.4
  - **File:** `apps/api/src/services/AuditService.ts`

- [ ] 6. Add `timezone` and `guestTimezone` fields to `AppointmentModel`
  - Open `apps/api/src/models/Appointment.model.ts`
  - Add `timezone: { type: String }` (optional, IANA identifier stored at booking time)
  - Add `guestTimezone: { type: String }` (optional, visitor-supplied, informational)
  - Both fields are not `required` — existing documents without them remain valid
  - **Requirement:** 4.2, 4.5
  - **File:** `apps/api/src/models/Appointment.model.ts`

- [ ] 7. Add unique compound slot index and sparse unique `confirmationNumber` index to `AppointmentModel`
  - In the same file as task 6, add below the existing indexes:
  - `AppointmentSchema.index({ organizationId: 1, date: 1, time: 1, leadPhone: 1 }, { unique: true, name: 'unique_slot_per_phone' })`
  - `AppointmentSchema.index({ confirmationNumber: 1 }, { unique: true, sparse: true, name: 'unique_confirmation_number' })`
  - Do not remove any existing indexes
  - **Requirement:** 2.4, 3.3, 9.5
  - **File:** `apps/api/src/models/Appointment.model.ts`

- [ ] 8. Add `timezone` and `guestTimezone` to `CreateAppointmentSchema` DTO
  - Open `apps/api/src/dto/appointment.dto.ts`
  - Add `timezone: z.string().optional()` to `CreateAppointmentSchema`
  - Add `guestTimezone: z.string().optional()` to `CreateAppointmentSchema`
  - Both are optional — the authenticated `/appointments` endpoint is unaffected
  - **Requirement:** 4.2, 4.5
  - **File:** `apps/api/src/dto/appointment.dto.ts`

- [ ] 9. Fix `AppointmentService.list` default sort to include `createdAt` tiebreaker
  - Open `apps/api/src/services/AppointmentService.ts`
  - In the `list` method, replace the single-field sort with: `const sort: Record<string, 1 | -1> = { [sortField]: sortOrder }; if (!q.sortBy) sort.createdAt = -1;`
  - Apply `sort` object to `.sort(sort)` call
  - **Requirement:** 6.5
  - **File:** `apps/api/src/services/AppointmentService.ts`

- [ ] 10. Add `Idempotency-Key` to CORS `allowedHeaders` in `app.ts`
  - Open `apps/api/src/app.ts`
  - In the `cors()` config, add `'Idempotency-Key'` to the `allowedHeaders` array
  - **Requirement:** 2.1
  - **File:** `apps/api/src/app.ts`

- [ ] 11. Add `resolveOrgDoc` helper to `widgetController.ts`
  - Open `apps/api/src/controllers/widgetController.ts`
  - Add a new `resolveOrgDoc` async function that returns the full `OrganizationDocument` (not just the id string)
  - Keep the existing `resolveOrg` function intact — it is used by `getWidgetConfig`, `widgetCreateLead`, `widgetCreateConversation`, and `widgetChat`
  - Import `isValidTimezone` from `../calendar/timezone/TimezoneService`
  - Import `idempotencyCache` and `BookingConfirmationResponse` from `../utils/IdempotencyCache`
  - Import `generateConfirmationNumber` from `../utils/confirmationNumber`
  - Import `LeadModel` from `../models/Lead.model` and `ConversationModel` from `../models/Conversation.model` (needed for compensating deletes)
  - Import `AuditService` from `../services/AuditService`
  - Import `logger` from `../utils/logger` (root logger — still needed for non-request-scoped calls)
  - **Requirement:** 7.4, 7.5
  - **File:** `apps/api/src/controllers/widgetController.ts`

- [ ] 12. Add `guestTimezone` to `WidgetBookSchema` in `widgetController.ts`
  - In the `WidgetBookSchema` Zod object, add `guestTimezone: z.string().optional()`
  - **Requirement:** 4.5, 4.6
  - **File:** `apps/api/src/controllers/widgetController.ts`

- [ ] 13. Add redaction paths for `widgetToken` and `token` to the Pino logger config
  - Open `apps/api/src/utils/logger.ts`
  - Add `'*.widgetToken'` and `'*.token'` to the `REDACTED_FIELDS` array
  - Do not remove any existing entries from the array
  - **Requirement:** 10.5
  - **File:** `apps/api/src/utils/logger.ts`

- [ ] 14. Rewrite `widgetBook` with full reliability, observability, and performance guarantees
  - Replace the entire body of the `widgetBook` function in `apps/api/src/controllers/widgetController.ts` with the implementation specified in the design document
  - The new implementation must satisfy all reliability requirements (tasks 1–12) AND observability requirements (Req 10) AND performance requirements (Req 11):
    - Run `WidgetBookSchema.safeParse` first; return `{ status: 'error', code: 'VALIDATION_ERROR', errors: [{field, message}] }` on failure (req 7.1, 7.2)
    - Call `resolveOrgDoc` and validate `org.timezone` with `isValidTimezone`; throw `ApiError(422, ..., 'INVALID_TIMEZONE')` if invalid (req 4.3)
    - Check `Idempotency-Key` header against `idempotencyCache`; return HTTP 200 with cached data on hit; emit structured info log and call `AuditService.logBookingDuplicate` (req 2.1, 2.2, 2.5, 8.4)
    - Set up a 10-second `setTimeout` abort guard at the start of the handler; clear it in a `finally` block; if the timeout fires, emit `booking.timeout` log (req 11.3, 11.6), attempt compensating cleanup of any created entities, and send HTTP 503 `REQUEST_TIMEOUT` if headers not already sent
    - Track `convId` and `leadId` as nullable strings for cleanup
    - Create or reuse conversation (req 1.1, 6.3); emit `booking.conversation_created` info log (req 10.2)
    - Create lead with `status: 'New'` and `source: 'widget'` (req 6.2); emit `booking.lead_created` info log (req 10.2); do NOT re-fetch the lead document (req 11.4)
    - Loop up to 3 attempts: generate confirmation number, attempt `AppointmentService.create` with `timezone` and `guestTimezone` fields (req 3.1–3.4, 4.2, 4.5); do NOT re-fetch the appointment document (req 11.4); emit `booking.appointment_created` info log on success (req 10.2)
    - On duplicate key error for slot (`leadPhone` in `keyPattern`): fetch existing appointment, throw `ApiError(409, ..., 'DUPLICATE_BOOKING', { appointmentId, confirmationNumber })` (req 2.3, 2.4, 9.1, 9.2)
    - On duplicate key error for `confirmationNumber`: retry if `attempt < 3`, else fall through to cleanup (req 3.4)
    - Await `LeadService.update(appointmentId)` with one retry on failure; log warning if both fail (req 5.2, 5.3, 5.4)
    - Await `ConversationService.update(leadId, appointmentId, status:'completed')`; log warning on failure (req 1.6, 6.3)
    - Emit `booking.completed` info log before response (req 10.2)
    - Emit `booking_created` structured log (req 8.1)
    - Call `AuditService.logBookingCreated` non-blocking (req 8.3)
    - Call `AutomationService.fire` non-blocking (req 2.5, 9.7)
    - Store result in `idempotencyCache` if key was provided
    - Return HTTP 201 with `confirmationNumber` in response body (req 3.5)
    - In the catch block: emit `booking.failed` error log via `req.logger` with step name, errorMessage, stack, and all available entity IDs (req 10.3); delete created Lead and created Conversation (but not pre-existing conversations); log orphan IDs if cleanup fails; re-throw (req 1.2, 1.7, 5.1, 9.3, 9.4)
    - Handle `DUPLICATE_BOOKING` ApiError in the outer catch: return HTTP 409 with `{ status, code, message, appointmentId, confirmationNumber }` (req 9.2)
    - Use `req.logger` for ALL log calls inside `widgetBook` (req 10.1); wrap each log call in try/catch (req 10.4)
    - Never log `req.body` or raw idempotency key value (req 10.6)
  - **Requirement:** 1.1–1.7, 2.1–2.5, 3.1–3.5, 4.2–4.6, 5.1–5.6, 6.2–6.3, 7.1–7.5, 8.1–8.4, 9.1–9.7, 10.1–10.7, 11.3–11.4, 11.6
  - **File:** `apps/api/src/controllers/widgetController.ts`

- [ ] 15. Verify build compiles without errors
  - Run `npm run build` (or `tsc --noEmit`) in `apps/api`
  - Fix any TypeScript errors introduced by the new fields, imports, or function signatures
  - Confirm no existing tests are broken by running `npm test` if a test suite exists
  - **File:** `apps/api`

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 2, 3, 4, 9, 10, 13],
      "description": "Foundation utilities, standalone fixes, and logger redaction — no dependencies between them"
    },
    {
      "wave": 2,
      "tasks": [5, 6, 7, 8],
      "description": "Model/service extensions — task 5 depends on task 4; tasks 6/7/8 are independent"
    },
    {
      "wave": 3,
      "tasks": [11, 12],
      "description": "Widget controller setup — imports and schema extension; depends on tasks 1-3, 5"
    },
    {
      "wave": 4,
      "tasks": [14],
      "description": "Core widgetBook rewrite with reliability + observability — depends on all previous tasks"
    },
    {
      "wave": 5,
      "tasks": [15],
      "description": "Build verification — terminal task"
    }
  ]
}
```

---

## Notes

- Tasks 6 and 7 edit the same file — do them together in one pass.
- Tasks 11, 12, and 14 edit the same file — do them together in one pass.
- The new MongoDB indexes (task 7) will be created automatically on application startup via Mongoose `ensureIndexes`. For production deployments with existing data, check for duplicate `{ organizationId, date, time, leadPhone }` combinations before deploying — duplicate documents will prevent the index from building.
- The `AuditService` currently only has an `AUTH` category. Use `AuditCategory.AUTH` for the new booking events until a `BOOKING` category is added in a future sprint.
- No frontend changes are in scope for this sprint. The widget frontend already receives `confirmationNumber` from the API response and must not generate its own. If a frontend repo is added later, verify it does not call `Math.random()` for confirmation identifiers.
- Task 13 (`logger.ts` redaction) is a standalone one-liner that must land before task 14 to ensure the redaction config is in place when `widgetBook` is rewritten.
