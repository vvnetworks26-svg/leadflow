# Technical Design Document
# Sprint 1.1 — Booking Flow Audit & Reliability

## Overview

This document specifies every concrete change required to make the widget booking pipeline production-ready. No new UI is introduced. All changes are confined to the API layer (`apps/api`) with one exception: the frontend confirmation display must be corrected to use the server-returned `confirmationNumber` instead of a locally generated value.

The core problem is that `widgetBook` in `widgetController.ts` is a 7-step sequential function with no rollback, no idempotency, a fire-and-forget back-link update, no duplicate index enforcement, no timezone field on the Appointment, and a `catch(() => {})` that silently swallows failures. Each section below addresses exactly one category of failure.

---

## Architecture

### Current Flow (broken paths highlighted)

```
POST /api/v1/widget/:token/book
  │
  ├─ 1. Validate with WidgetBookSchema
  ├─ 2. resolveOrg(token)
  ├─ 3. ConversationService.create / update       ← created, no cleanup on later failure
  ├─ 4. LeadService.create                        ← created, no cleanup on later failure
  ├─ 5. generate confirmationNumber               ← Math.random risk in frontend
  ├─ 6. AppointmentService.create                 ← no unique index, collision possible
  ├─ 7. LeadService.update(.catch(() => {}))       ← ⚠ fire-and-forget, silently fails
  ├─ 8. AutomationService.fire (fire-and-forget)  ← fires even on duplicates
  └─ 9. res.status(201)
```

### Target Flow (all failure paths handled)

```
POST /api/v1/widget/:token/book
  │
  ├─ 0. Idempotency check (Idempotency-Key header → IdempotencyCache)
  │      └─ HIT  → return HTTP 200 with cached response (skip all steps)
  │
  ├─ 1. Validate with WidgetBookSchema (422 on failure)
  ├─ 2. resolveOrg(token) — validate org.timezone is a valid IANA identifier (422 if not)
  │
  ├─ 3. ConversationService.create / update
  │
  ├─ 4. LeadService.create
  │      └─ FAIL → delete Conversation → HTTP 500
  │
  ├─ 5. generateConfirmationNumber() — retry loop up to 3×
  │
  ├─ 6. AppointmentService.create (unique index on {orgId,date,time,phone})
  │      └─ DUPLICATE KEY (11000) → delete Lead + Conversation → HTTP 409 DUPLICATE_BOOKING
  │      └─ OTHER ERROR → delete Lead + Conversation → HTTP 500
  │
  ├─ 7. await LeadService.update(appointmentId)  ← awaited, retried once on failure
  │      └─ FAIL after retry → log warning, continue (primary entities intact)
  │
  ├─ 8. await ConversationService.update(appointmentId, leadId, status:'completed')
  │
  ├─ 9. AuditService.logBookingCreated(...)      ← non-blocking
  ├─10. logger.info(booking_created structured log)
  ├─11. AutomationService.fire(...)              ← fire-and-forget (skipped on 409/idempotent)
  └─12. res.status(201) + store idempotency result
```

---

## Components and Interfaces

### 1. IdempotencyCache (new)
**File:** `apps/api/src/utils/IdempotencyCache.ts`

An in-process Map-based cache with TTL of 24 hours. Stores the serialized HTTP response body keyed on `organizationId:idempotencyKey`. Because the application may run on multiple Render instances, this is an **in-process only** cache used as a fast path — the database unique index (Component 2) is the authoritative distributed duplicate guard.

> **Note on multi-instance deployments:** The unique index on `{ organizationId, date, time, leadPhone }` is the source of truth for concurrent duplicate prevention (Requirement 9). The IdempotencyCache accelerates repeat requests from the same instance within 24 hours (Requirement 2). The database index handles cross-instance races.

```typescript
interface IdempotencyEntry {
  response:  BookingConfirmationResponse;
  createdAt: Date;
}

class IdempotencyCache {
  private store = new Map<string, IdempotencyEntry>();
  private readonly TTL_MS = 24 * 60 * 60 * 1000;

  get(key: string): BookingConfirmationResponse | null
  set(key: string, response: BookingConfirmationResponse): void
  private isExpired(entry: IdempotencyEntry): boolean
  private evict(): void  // remove entries older than TTL
}

export const idempotencyCache = new IdempotencyCache();
```

Cache key format: `${organizationId}:${idempotencyKey}`

### 2. AppointmentModel — new indexes
**File:** `apps/api/src/models/Appointment.model.ts`

Two index changes:

```typescript
// NEW: duplicate-booking prevention (unique per slot per org per phone)
AppointmentSchema.index(
  { organizationId: 1, date: 1, time: 1, leadPhone: 1 },
  { unique: true, name: 'unique_slot_per_phone' }
);

// NEW: unique confirmation number (sparse — allows null during retries)
AppointmentSchema.index(
  { confirmationNumber: 1 },
  { unique: true, sparse: true, name: 'unique_confirmation_number' }
);

// NEW: timezone field added to schema
timezone: { type: String, required: false }   // IANA identifier, e.g. 'America/New_York'
guestTimezone: { type: String, required: false }  // visitor's timezone, informational only
```

### 3. generateConfirmationNumber (new utility)
**File:** `apps/api/src/utils/confirmationNumber.ts`

Extracted from `widgetBook` and hardened with a retry loop. This function is called by `widgetBook` before `AppointmentService.create`.

```typescript
import { randomBytes } from 'crypto';

export function generateConfirmationNumber(): string {
  return `LF-${randomBytes(3).toString('hex').toUpperCase()}`;
}
```

The retry loop lives in `widgetBook` — see Section 5.

### 4. AuditService — booking events (extended)
**File:** `apps/api/src/services/AuditService.ts`

The existing `AuditService` only covers auth lifecycle events. Two new helpers are added. The `AuditEvent` enum and `EVENT_SEVERITY` map in `AuditLog.model.ts` must also be extended.

```typescript
// New event types to add to AuditEvent enum in AuditLog.model.ts:
BOOKING_CREATED = 'booking_created',
BOOKING_DUPLICATE = 'booking_duplicate',

// New helpers on AuditService:
logBookingCreated(ctx: {
  organizationId: string;
  leadId:         string;
  appointmentId:  string;
  conversationId: string;
  confirmationNumber: string;
  ipAddress?:     string;
}): void

logBookingDuplicate(ctx: {
  organizationId:      string;
  idempotencyKey:      string;
  confirmationNumber:  string;
  ipAddress?:          string;
}): void
```

Both are fire-and-forget (non-blocking), matching the existing pattern.

### 5. widgetBook — rewritten
**File:** `apps/api/src/controllers/widgetController.ts`

The `widgetBook` function is rewritten in-place. All other functions in the file (`getWidgetConfig`, `widgetCreateLead`, `widgetCreateConversation`, `widgetChat`) are **unchanged**.

The full replacement is detailed in the Implementation section.

### 6. Conversation model — leadId field
**File:** `apps/api/src/models/Conversation.model.ts`

The `leadId` field already exists on the schema. The `appointmentId` field already exists. Both are `String` type. No schema change needed — the gap is that `widgetBook` never writes `leadId` to the Conversation document after creating the Lead. This is corrected in the rewritten `widgetBook`.

### 7. AppointmentService — sort default fix
**File:** `apps/api/src/services/AppointmentService.ts`

The default sort is `date` descending but lacks a `createdAt` tiebreaker.

```typescript
// Before:
const sortField = q.sortBy ?? 'date';
const sortOrder = q.order === 'asc' ? 1 : -1;
AppointmentModel.find(filter).sort({ [sortField]: sortOrder })

// After:
const sortField = q.sortBy ?? 'date';
const sortOrder = q.order === 'asc' ? 1 : -1;
const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };
if (!q.sortBy) sort.createdAt = -1;  // tiebreaker when using default sort
AppointmentModel.find(filter).sort(sort)
```

### 8. AuditLog model — extended
**File:** `apps/api/src/models/AuditLog.model.ts`

Two new event types added to the existing enum:
```typescript
BOOKING_CREATED  = 'booking_created',
BOOKING_DUPLICATE = 'booking_duplicate',
```
Both are `info` severity. Added to `EVENT_SEVERITY` map.

---

## Data Models

### Appointment (changes only)

| Field | Type | Was | Now |
|---|---|---|---|
| `timezone` | `String` | missing | added, IANA identifier of the business timezone at booking time |
| `guestTimezone` | `String` | missing | added, visitor-supplied IANA identifier (informational) |
| `confirmationNumber` | `String` | no index | sparse unique index |
| `leadPhone` + `date` + `time` + `organizationId` | — | separate indexes | compound unique index `unique_slot_per_phone` |

### Idempotency Entry (in-memory only, no MongoDB collection)

```typescript
{
  key:       string,   // "${organizationId}:${idempotencyKey}"
  response:  BookingConfirmationResponse,
  createdAt: Date
}
```

No MongoDB collection is created for idempotency. The unique appointment index handles distributed duplicate prevention. The in-memory cache handles repeat requests from the same process within 24 hours.

### AuditLog (additions only)

Two new values in the `AuditEvent` enum: `booking_created`, `booking_duplicate`. No new fields on the document schema.

---

## Implementation

### widgetBook — full replacement logic

```typescript
export async function widgetBook(req: Request, res: Response, next: NextFunction) {
  try {
    // ── Step 1: Validate input ──────────────────────────────────────────────
    const result = WidgetBookSchema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
      }));
      return res.status(422).json({ status: 'error', code: 'VALIDATION_ERROR', errors });
    }
    const d = result.data;

    // ── Step 2: Resolve org + validate timezone ─────────────────────────────
    const org = await resolveOrgDoc(req.params.token);   // returns full doc, not just id
    const orgId = org.id as string;
    if (!org.timezone || !isValidTimezone(org.timezone)) {
      throw new ApiError(422, 'Organization timezone is missing or invalid', 'INVALID_TIMEZONE');
    }

    // ── Step 0: Idempotency check (fast path) ───────────────────────────────
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const cached = idempotencyCache.get(`${orgId}:${idempotencyKey}`);
      if (cached) {
        logger.info({
          idempotencyKey,
          originalConfirmationNumber: cached.confirmationNumber,
          organizationId: orgId,
          timestamp: new Date().toISOString(),
        }, '[booking] idempotency cache hit');
        AuditService.logBookingDuplicate({
          organizationId: orgId,
          idempotencyKey,
          confirmationNumber: cached.confirmationNumber,
          ipAddress: req.ip,
        });
        return res.status(200).json({ status: 'ok', data: cached });
      }
    }

    // Track created entity IDs for cleanup on failure
    let convId:      string | null = null;
    let leadId:      string | null = null;

    try {
      // ── Step 3: Create or reuse conversation ──────────────────────────────
      if (d.conversationId) {
        convId = d.conversationId;
        if (d.messages.length > 0) {
          await ConversationService.update(orgId, convId, {
            status:        'completed',
            lastMessageAt: new Date().toISOString(),
            messages:      d.messages as any,
          }).catch(() => { /* best-effort update of pre-existing conversation */ });
        }
      } else {
        const conv = await ConversationService.create(orgId, {
          leadName:      d.customerName,
          leadPhone:     d.phone,
          leadEmail:     d.email,
          hvacNeed:      d.service,
          status:        'completed',
          lastMessageAt: new Date().toISOString(),
          messages:      d.messages,
        });
        convId = conv.id as string;
      }

      // ── Step 4: Create lead ───────────────────────────────────────────────
      const leadDto = CreateLeadSchema.parse({
        name:                d.customerName,
        phone:               d.phone,
        email:               d.email ?? '',
        address:             d.address,
        zipCode:             d.zipCode,
        hvacNeed:            d.hvacNeed ?? d.service,
        emergency:           d.emergency,
        source:              'widget',
        status:              'New',
        priority:            d.priority,
        value:               d.value,
        conversationId:      convId,
        qualificationReason: d.qualificationReason,
        preferredDay:        d.preferredDay,
        notes:               d.notes ?? `Booked via widget chat. Service: ${d.service}.`,
      });
      const lead = await LeadService.create(orgId, leadDto);
      leadId = lead.id;

      // ── Step 5: Generate confirmation number (with retry on collision) ────
      let confirmationNumber: string | null = null;
      let appointment: Appointment | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        confirmationNumber = generateConfirmationNumber();

        try {
          // ── Step 6: Create appointment ──────────────────────────────────
          appointment = await AppointmentService.create(orgId, {
            leadId,
            leadName:          d.customerName,
            leadPhone:         d.phone,
            customerEmail:     d.email,
            address:           d.address,
            zipCode:           d.zipCode,
            conversationId:    convId,
            date:              d.date,
            time:              d.time,
            duration:          d.duration,
            type:              inferType(d.service, d.emergency),
            status:            'Confirmed',
            notes:             d.notes ?? `Booked via widget chat. Service: ${d.service}.`,
            confirmationNumber,
            source:            'widget',
            value:             d.value,
            timezone:          org.timezone,
            guestTimezone:     d.guestTimezone,
          });
          break; // success — exit retry loop
        } catch (err: any) {
          const isDuplicateKey   = err?.code === 11000 || err?.code === 11001;
          const isSlotConflict   = isDuplicateKey && err?.keyPattern?.leadPhone !== undefined;
          const isConfNumConflict = isDuplicateKey && err?.keyPattern?.confirmationNumber !== undefined;

          if (isSlotConflict) {
            // Concurrent or duplicate booking for same slot/phone — 409
            const existing = await AppointmentModel.findOne({
              organizationId: orgId, date: d.date, time: d.time, leadPhone: d.phone,
            }).lean();
            throw new ApiError(409,
              'An appointment already exists for this slot',
              'DUPLICATE_BOOKING',
              { appointmentId: existing?.id, confirmationNumber: existing?.confirmationNumber }
            );
          }

          if (isConfNumConflict && attempt < 3) {
            continue; // retry with new confirmation number
          }

          throw err; // re-throw for outer catch → cleanup
        }
      }

      if (!appointment) {
        throw new ApiError(500, 'Failed to generate a unique confirmation number after 3 attempts', 'CONFIRMATION_COLLISION');
      }

      // ── Step 7: Await back-link on Lead ───────────────────────────────────
      try {
        await LeadService.update(orgId, leadId, { appointmentId: appointment.id });
      } catch (linkErr) {
        // Retry once
        try {
          await LeadService.update(orgId, leadId, { appointmentId: appointment.id });
        } catch (retryErr) {
          logger.warn({
            leadId,
            appointmentId: appointment.id,
            err: retryErr,
          }, '[booking] Lead back-link update failed after retry — booking still valid');
        }
      }

      // ── Step 8: Update Conversation with leadId + appointmentId ──────────
      await ConversationService.update(orgId, convId!, {
        leadId:        leadId,
        appointmentId: appointment.id,
        status:        'completed',
      }).catch((err) => {
        logger.warn({ convId, leadId, appointmentId: appointment!.id, err },
          '[booking] Conversation cross-link update failed');
      });

      // ── Step 9: Structured success log ────────────────────────────────────
      logger.info({
        organizationId:    orgId,
        leadId,
        appointmentId:     appointment.id,
        conversationId:    convId,
        confirmationNumber,
        timestamp:         new Date().toISOString(),
      }, '[booking] booking_created');

      // ── Step 10: AuditService (non-blocking) ──────────────────────────────
      AuditService.logBookingCreated({
        organizationId:    orgId,
        leadId,
        appointmentId:     appointment.id,
        conversationId:    convId!,
        confirmationNumber: confirmationNumber!,
        ipAddress:         req.ip,
      });

      // ── Step 11: Automation (fire-and-forget) ─────────────────────────────
      AutomationService.fire('booking_made', orgId, leadId, {
        bookingId:         appointment.id,
        meetingType:       inferType(d.service, d.emergency),
        confirmationNumber,
      });

      // ── Step 12: Build response + store idempotency entry ─────────────────
      const responseData: BookingConfirmationResponse = {
        appointmentId:     appointment.id,
        confirmationNumber: confirmationNumber!,
        conversationId:    convId!,
        leadId,
        customerName:      d.customerName,
        service:           d.service,
        date:              d.date,
        time:              d.time,
        displayDate:       d.displayDate,
        displayTime:       d.displayTime,
        estimatedDuration: d.duration,
        address:           d.address,
      };

      if (idempotencyKey) {
        idempotencyCache.set(`${orgId}:${idempotencyKey}`, responseData);
      }

      return res.status(201).json({ status: 'ok', data: responseData });

    } catch (innerErr: any) {
      // ── Compensating cleanup ───────────────────────────────────────────────
      const failedCleanups: string[] = [];

      if (leadId) {
        try {
          await LeadModel.findByIdAndDelete(leadId);
        } catch {
          failedCleanups.push(`lead:${leadId}`);
        }
      }

      if (convId && !d.conversationId) {
        // Only delete if WE created the conversation (not pre-existing)
        try {
          await ConversationModel.findByIdAndDelete(convId);
        } catch {
          failedCleanups.push(`conversation:${convId}`);
        }
      }

      if (failedCleanups.length > 0) {
        logger.error({
          organizationId: orgId,
          failedCleanups,
          err: innerErr,
        }, '[booking] compensating cleanup failed — orphan records may exist');
      }

      // Re-throw to outer error handler
      throw innerErr;
    }

  } catch (e: any) {
    // If this is a DUPLICATE_BOOKING ApiError with extra data, serialize it
    if (e instanceof ApiError && e.code === 'DUPLICATE_BOOKING') {
      return res.status(409).json({
        status:  'error',
        code:    'DUPLICATE_BOOKING',
        message: e.message,
        ...(e.extra ?? {}),
      });
    }
    next(e);
  }
}
```

### ApiError — extra data field

The current `ApiError` class does not support an `extra` payload. Add an optional `extra` field:

```typescript
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly extra?: Record<string, unknown>,  // NEW
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

### resolveOrgDoc helper

Replace the existing `resolveOrg` function with `resolveOrgDoc` that returns the full Organization document:

```typescript
async function resolveOrgDoc(token: string): Promise<OrganizationDocument & { id: string }> {
  const org =
    await OrganizationModel.findOne({ slug: token, status: 'active' }) ??
    await OrganizationModel.findOne({ _id: token, status: 'active' }).catch(() => null);
  if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
  return org as any;
}
```

The original `resolveOrg` can remain for the other widget endpoints (config, leads, conversations, chat) which only need the ID.

### WidgetBookSchema — guestTimezone field

Add the optional field to the Zod schema:

```typescript
guestTimezone: z.string().optional(),  // IANA timezone, informational only
```

### AppointmentService.create — no changes to signature

The `CreateAppointmentDto` in `appointment.dto.ts` must accept the two new optional fields:

```typescript
timezone:      z.string().optional(),
guestTimezone: z.string().optional(),
```

---

## Error Responses

| Scenario | HTTP | code |
|---|---|---|
| Invalid input fields | 422 | `VALIDATION_ERROR` |
| Token not found / not active | 404 | `ORG_NOT_FOUND` |
| Org timezone missing/invalid | 422 | `INVALID_TIMEZONE` |
| Duplicate slot (DB index) | 409 | `DUPLICATE_BOOKING` |
| Confirmation number collision after 3 retries | 500 | `CONFIRMATION_COLLISION` |
| Any other unhandled error | 500 | `INTERNAL_SERVER_ERROR` |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Idempotency cache hit | 200 | — (success response) |

### 409 DUPLICATE_BOOKING response body

```json
{
  "status": "error",
  "code": "DUPLICATE_BOOKING",
  "message": "An appointment already exists for this slot",
  "appointmentId": "<existing appointment id>",
  "confirmationNumber": "<existing confirmation number>"
}
```

---

## Structured Log Fields

### booking_created (info)
```json
{
  "organizationId":    "string",
  "leadId":            "string",
  "appointmentId":     "string",
  "conversationId":    "string",
  "confirmationNumber":"string",
  "timestamp":         "ISO 8601 UTC"
}
```

### booking_failed (error)
```json
{
  "organizationId": "string",
  "step": "resolve-org|create-conversation|create-lead|generate-confirmation|create-appointment|backlink-lead",
  "errorMessage":   "string",
  "leadId":         "string|null",
  "convId":         "string|null",
  "appointmentId":  "string|null"
}
```

### idempotency_cache_hit (info)
```json
{
  "idempotencyKey":             "string",
  "originalConfirmationNumber": "string",
  "organizationId":             "string",
  "timestamp":                  "ISO 8601 UTC"
}
```

---

## Files Changed

| File | Change type | Description |
|---|---|---|
| `src/controllers/widgetController.ts` | Modified | Rewrite `widgetBook`; add `resolveOrgDoc`; add `guestTimezone` to `WidgetBookSchema` |
| `src/models/Appointment.model.ts` | Modified | Add `timezone` + `guestTimezone` fields; add unique compound index; add sparse unique `confirmationNumber` index |
| `src/services/AppointmentService.ts` | Modified | Fix default sort to add `createdAt` tiebreaker |
| `src/dto/appointment.dto.ts` | Modified | Add `timezone` + `guestTimezone` optional fields to `CreateAppointmentSchema` |
| `src/middleware/errorHandler.ts` | Modified | Add `extra` field to `ApiError` class |
| `src/services/AuditService.ts` | Modified | Add `logBookingCreated` and `logBookingDuplicate` helpers |
| `src/models/AuditLog.model.ts` | Modified | Add `booking_created` and `booking_duplicate` to `AuditEvent` enum and `EVENT_SEVERITY` map |
| `src/utils/IdempotencyCache.ts` | New | In-process TTL cache for idempotency keys |
| `src/utils/confirmationNumber.ts` | New | `generateConfirmationNumber()` using `crypto.randomBytes` |

---

## Files Not Changed

| File | Reason |
|---|---|
| `src/services/LeadService.ts` | No changes needed — `create` and `update` are used as-is |
| `src/services/ConversationService.ts` | No changes needed — `create` and `update` are used as-is |
| `src/routes/widget.routes.ts` | Rate limiter already in place; `Idempotency-Key` is a standard header, no route change needed |
| `src/calendar/timezone/TimezoneService.ts` | `localToUtc` and `isValidTimezone` already implemented correctly |
| `src/crm/automation/AutomationService.ts` | Used as-is — called after success only |
| `src/app.ts` | No changes — `Idempotency-Key` must be added to `allowedHeaders` in CORS config |

### CORS allowedHeaders fix

In `src/app.ts`, `Idempotency-Key` must be added to `allowedHeaders`:

```typescript
// Before:
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],

// After:
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
```

---

## Migration Notes

### Database Index Migration

The two new unique indexes on `AppointmentModel` must be created against the existing collection. Because MongoDB cannot create a unique index on a collection that already has duplicate documents, the following must be verified before deployment:

1. Run a query to detect existing duplicates on `{ organizationId, date, time, leadPhone }`.
2. If duplicates exist, resolve them manually (keep the most recent, delete others) before the index is created.
3. The index creation happens automatically when the application starts (Mongoose calls `ensureIndexes`). No migration script is needed for empty or clean collections.

The `confirmationNumber` sparse unique index is safe to create with `sparse: true` because null values are excluded.

### Existing Appointments Without `timezone`

All existing Appointment documents will have `timezone: undefined`. Downstream consumers reading `timezone` must treat `undefined` as "timezone unknown" and fall back to the Organization's current timezone when displaying. No backfill is required by this sprint.

---

## Correctness Properties

These invariants must hold at all times after a `POST /api/v1/widget/:token/book` request completes:

### Property 1: No Orphan Records
**No orphan records.**

**Validates: Requirements 1.2, 1.3, 5.1, 9.3** If the response is HTTP 4xx or 5xx, no Lead, Conversation, or Appointment created during that specific request exists in the database (except: a pre-existing Conversation supplied via `conversationId` is never deleted).

### Property 2: Full Cross-Link
**Full cross-link.**

**Validates: Requirements 1.1, 1.4, 1.5, 1.6, 5.5, 6.3** If the response is HTTP 201, then:
   - `Appointment.leadId === Lead._id`
   - `Appointment.conversationId === Conversation._id`
   - `Lead.conversationId === Conversation._id`
   - `Conversation.leadId === Lead._id`
   - `Conversation.appointmentId === Appointment._id`
   - `Lead.appointmentId === Appointment._id` (best-effort — may lag if back-link retry fails)

### Property 3: One Appointment Per Slot Per Phone
**One appointment per slot per phone.**

**Validates: Requirements 2.3, 2.4, 9.1, 9.5** `{ organizationId, date, time, leadPhone }` is unique across the entire Appointment collection. This is enforced by the database index, not application code.

### Property 4: Unique Confirmation Number
**Unique confirmation number.**

**Validates: Requirements 3.1, 3.2, 3.3, 3.4** No two Appointment documents share the same non-null `confirmationNumber`. Enforced by sparse unique index.

### Property 5: No Automation on Duplicates
**No automation on duplicates.**

**Validates: Requirements 2.5, 9.7** `AutomationService.fire` is called exactly once per successful booking and never on idempotency cache hits or 409 rejections.

---

## Error Handling

See the Error Responses table above for HTTP status codes and error codes.

### Cascade failure matrix

| Step that fails | Entities created before failure | Cleanup action | Response |
|---|---|---|---|
| `resolveOrgDoc` | none | none | 404 |
| `isValidTimezone` check | none | none | 422 |
| `ConversationService.create` | none | none | 500 |
| `LeadService.create` | Conversation (if created by this request) | delete Conversation | 500 |
| `AppointmentService.create` (slot duplicate) | Conversation + Lead | delete Lead + Conversation | 409 |
| `AppointmentService.create` (other error, ≤3 conf retries) | Conversation + Lead | delete Lead + Conversation | 500 |
| `AppointmentService.create` (conf collision, all 3 retries exhausted) | Conversation + Lead | delete Lead + Conversation | 500 |
| Cleanup delete fails | orphan IDs | log error with IDs | 500 |
| `LeadService.update` (back-link) | all three entities | log warning, no rollback | 201 |
| `ConversationService.update` (cross-link) | all three entities | log warning, no rollback | 201 |

### Fire-and-forget operations (intentional)

These operations are intentionally non-blocking and their failure must not affect the booking response:
- `AuditService.logBookingCreated()`
- `AutomationService.fire()`
- `ConversationService.update()` for pre-existing conversations (message sync)

---

## Testing Strategy

### Unit tests (new file: `src/utils/confirmationNumber.test.ts`)
- Generates format matching `/^LF-[0-9A-F]{6}$/`
- 10,000 calls produce no duplicates (birthday problem check)

### Unit tests (`src/utils/IdempotencyCache.test.ts`)
- `get` returns null for unknown key
- `get` returns cached response after `set`
- `get` returns null after 24-hour TTL expires
- Cache hit does not increment a counter or trigger side effects

### Integration tests (`src/controllers/widgetController.test.ts`)
- **Happy path:** single booking creates exactly 1 Lead, 1 Conversation, 1 Appointment; all cross-links populated; HTTP 201 with `confirmationNumber` in body
- **Double-click:** two identical requests with same `Idempotency-Key` — second returns HTTP 200 with original confirmation
- **Concurrent slot:** two requests for same `{ organizationId, date, time, phone }` without idempotency key — exactly one succeeds (HTTP 201), other returns HTTP 409 `DUPLICATE_BOOKING` with `appointmentId` and `confirmationNumber`
- **Appointment creation failure:** mock `AppointmentModel.create` to throw — database has no Lead or Conversation afterwards
- **Lead creation failure:** mock `LeadService.create` to throw — database has no Conversation afterwards (if created in this request)
- **Back-link failure:** mock `LeadService.update` to throw — HTTP 201 returned, warning logged, Appointment and Lead exist
- **Invalid timezone:** org with `timezone: 'Invalid/Zone'` — HTTP 422 `INVALID_TIMEZONE`
- **Missing token:** unknown token — HTTP 404 `ORG_NOT_FOUND`
- **Rate limit:** 61 requests from same IP in 15 minutes — request 61 returns HTTP 429

### Load test (manual, using k6 or Artillery)
- 10 concurrent requests for the same slot (same org, date, time, phone) — assert exactly 1 Appointment in DB after all settle; 9 responses are 409

---

## Observability Design (Requirement 10)

### Logging approach

The existing `requestId` middleware already creates `req.logger` — a Pino child logger pre-bound with `{ requestId }`. The gap is that `widgetBook` currently imports and uses the root module-level `logger`, so the `requestId` is not present in any booking log entry. The fix is a one-line change: replace every `logger.info` / `logger.warn` / `logger.error` call in `widgetBook` with `req.logger.info` / `req.logger.warn` / `req.logger.error`. No new infrastructure is needed.

### Lifecycle event log entries

Each entry is written via `req.logger.info({ ...fields }, eventName)`. The `requestId` is injected automatically by the Pino child.

| Event constant | Level | Emitted after | Required fields |
|---|---|---|---|
| `booking.started` | info | schema validation passes | `organizationId` (once resolved), `event`, `timestamp` |
| `booking.validation_completed` | info | `WidgetBookSchema.safeParse` succeeds | `event`, `phone`, `date`, `time`, `timestamp` |
| `booking.conversation_created` | info | `ConversationService.create` returns | `event`, `conversationId`, `organizationId`, `timestamp` |
| `booking.lead_created` | info | `LeadService.create` returns | `event`, `leadId`, `conversationId`, `organizationId`, `timestamp` |
| `booking.appointment_created` | info | `AppointmentService.create` returns | `event`, `appointmentId`, `leadId`, `conversationId`, `confirmationNumber`, `organizationId`, `timestamp` |
| `booking.completed` | info | before `res.status(201)` | `event`, `appointmentId`, `leadId`, `conversationId`, `confirmationNumber`, `organizationId`, `timestamp` |

### Failure log entry

```typescript
req.logger.error({
  event:          'booking.failed',
  step,           // one of the 9 step names in Req 10.3
  errorMessage:   err instanceof Error ? err.message : String(err),
  stack:          err instanceof Error ? err.stack ?? null : null,
  organizationId: orgId ?? undefined,
  leadId:         leadId ?? undefined,
  appointmentId:  appointment?.id ?? undefined,
  conversationId: convId ?? undefined,
  timestamp:      new Date().toISOString(),
}, 'booking.failed');
```

### Redaction additions

Two new paths are added to the `REDACTED_FIELDS` array in `apps/api/src/utils/logger.ts`:

```typescript
'*.widgetToken',
'*.token',    // already partially covered by existing entry — ensure top-level too
```

The `:token` path parameter is passed to `resolveOrgDoc` but never stored in a log metadata object under the existing flow. The redaction rule is a safety net in case it is ever accidentally added.

### Logging failure safety

All `req.logger` calls in `widgetBook` are wrapped in individual try/catch blocks, or Pino's internal error handling is relied upon (Pino never throws on `logger.info` — it writes to `process.stderr` on transport failure). The explicit guard in `widgetBook` is:

```typescript
try {
  req.logger.info({ event: 'booking.lead_created', leadId, ... }, 'booking.lead_created');
} catch {
  // logging must never interrupt the booking
}
```

In practice Pino is designed to never throw, so this guard is defensive-only and does not add meaningful overhead.

### What is never logged

- `req.body` (raw request body)
- `req.headers['idempotency-key']` raw value (only the cache hit event is logged, not the key value itself)
- Widget token (`:token` path param)
- Any field covered by existing Pino redaction (`authorization`, `password`, `passwordHash`, `accessToken`, `refreshToken`, `cookie`)

---

## Performance Design (Requirement 11)

### Latency targets and measurement

No APM agent or Prometheus endpoint exists. The `requestId` middleware already emits a `request completed` log entry on every `res.finish` with a `durationMs` field (nanosecond precision via `process.hrtime.bigint()`). This is the authoritative latency signal.

To calculate P95/P99 for the booking endpoint:
```
filter: method=POST AND path=/api/v1/widget/*/book
field:  durationMs
```

No code change is needed for the latency signal — it is already in place.

**SLOs:**
- P95 ≤ 2000ms
- P99 ≤ 4000ms

Measured under load-test: 30 simultaneous requests for 60 seconds, single instance, healthy Atlas connection.

### Request timeout (10 seconds)

Express has no built-in request timeout. A per-route timeout must be added to `widget.routes.ts` using Node's `AbortController` pattern or a lightweight middleware. The chosen approach is a `setTimeout`-based AbortController wrapper in `widgetBook` itself — no new dependency:

```typescript
// At the top of widgetBook, before any async work:
const BOOKING_TIMEOUT_MS = 10_000;
let timedOut = false;
const timeoutHandle = setTimeout(async () => {
  timedOut = true;
  // Emit timeout log (req 11.6)
  try {
    req.logger.error({
      event: 'booking.timeout',
      requestId: req.requestId,
      organizationId: orgId ?? undefined,
      leadId: leadId ?? undefined,
      conversationId: convId ?? undefined,
      durationMs: BOOKING_TIMEOUT_MS,
      timestamp: new Date().toISOString(),
    }, 'booking.timeout');
  } catch { /* logging must not interrupt */ }
  // Compensating cleanup (req 11.3 → same logic as Req 1.2)
  // ... delete leadId and convId if set
  if (!res.headersSent) {
    res.status(503).json({ status: 'error', code: 'REQUEST_TIMEOUT' });
  }
}, BOOKING_TIMEOUT_MS);

try {
  // ... booking flow ...
} finally {
  clearTimeout(timeoutHandle);
}
```

The `timedOut` flag is checked at each async step; if set, the step exits early without writing to the database.

### Unnecessary database reads (Req 11.4)

The current `widgetBook` does not re-fetch Lead or Appointment after creation — `LeadService.create` and `AppointmentService.create` both return the full document from the Mongoose `create()` call. No change needed; this is a guard against future regression.

The `resolveOrgDoc` lookup (one `findOne`) is unavoidable — it is needed to validate the timezone field. The idempotency check adds zero DB reads (in-memory Map). Total DB operations per successful booking: 1 read (org) + 1 create (conversation) + 1 create (lead) + 1 create (appointment) + 1 update (lead back-link) + 1 update (conversation cross-link) = 5 writes, 1 read.

### Performance signals via structured logs

| Signal | Log field/filter |
|---|---|
| Booking latency | `durationMs` on `request completed` where `method=POST` and `path` matches `widget/*/book` |
| Failed bookings | `event='booking.failed'` |
| Duplicate attempts (idempotency) | `event='booking.idempotency_hit'` |
| Duplicate attempts (DB conflict) | `status=409` and `code='DUPLICATE_BOOKING'` on `request completed` |
| Compensating cleanups | `event='booking.failed'` with `leadId` or `conversationId` present |
| Timeout events | `event='booking.timeout'` |

### Files changed (additions for Req 11)

| File | Change |
|---|---|
| `src/controllers/widgetController.ts` | Add `setTimeout`/`AbortController` timeout wrapper inside `widgetBook`; add `timedOut` guard; emit `booking.timeout` log |
| `src/routes/widget.routes.ts` | No change — timeout is handled in the handler, not at the route level |
