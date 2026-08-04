# Layer 8 — Booking Engine

## Mission

The Booking Engine is the **single source of truth** for appointment scheduling in LeadFlow. No other layer performs scheduling logic.

```
Decision Engine
      ↓
Booking Engine  ← HERE (owns all scheduling)
      ↓
Response Engine (explains the result)
      ↓
Validation Engine
      ↓
Customer
```

## Module map

| File | Responsibility | Pure? |
|------|---------------|-------|
| `BookingEngine.ts` | Public entry point | ✅ |
| `BookingCoordinator.ts` | Full booking lifecycle orchestration | ⚡ |
| `AvailabilityService.ts` | Slot fetching (provider + rules) | ⚡ |
| `SlotGenerator.ts` | Pure slot generation from business hours | ✅ |
| `SlotValidator.ts` | Validates a single slot | ✅ |
| `BookingValidator.ts` | Validates a complete booking request | ✅ |
| `BookingConfirmation.ts` | Deterministic confirmation objects | ✅ |
| `BookingSummary.ts` | Human-readable summaries for Response Engine | ✅ |
| `BusinessHours.ts` | Business hours open/closed logic | ✅ |
| `TimezoneService.ts` | Timezone conversions + display formatting | ✅ |
| `BookingRules.ts` | Derives effective rules from BusinessIdentity | ✅ |
| `BookingPolicy.ts` | Permission checks from BusinessIdentity | ✅ |
| `CalendarProvider.ts` | Provider interface + registry | ✅ |
| `MockCalendarProvider.ts` | In-memory mock for tests | ✅ |
| `GoogleCalendarProvider.ts` | Google Calendar adapter | ⚡ |
| `OutlookCalendarProvider.ts` | Outlook/M365 adapter | ⚡ |

## Usage

```typescript
import { BookingEngine, BookingSummaryBuilder } from './booking-engine';

// Get available slots
const availability = await BookingEngine.getAvailability(identity, {
  nowMs,
  guestTimezone: 'America/Chicago',
});
// → { slots, nextAvailable, suggested, hasOpenSlots }

// Book
const result = await BookingEngine.book(request, identity, blockedSlots);
if (result.success) {
  const msg = BookingSummaryBuilder.confirmationMessage(result.summary!);
  // → "✅ You're all set, Alice! ..."
}

// Cancel
await BookingEngine.cancel(confirmation, organizationId, conversationId);
```

## Validation rules

All enforced by `BookingValidator` → `SlotValidator` in this order:

1. `BOOKING_NOT_PERMITTED` — `book_appointment` permission not in BusinessIdentity
2. `MISSING_NAME` — guest name required
3. `MISSING_PHONE` — phone or email required
4. `MISSING_SERVICE` — service type required
5. `MISSING_SLOT` — no slot provided
6. `SLOT_IN_PAST` — slot has already passed
7. `INSUFFICIENT_NOTICE` — less than `minimumNoticeHours` until slot
8. `OUTSIDE_ADVANCE_WINDOW` — more than `maximumBookingDays` in the future
9. `VACATION_MODE` — business is in vacation mode
10. `BUSINESS_CLOSED` — slot falls outside open hours
11. `WEEKEND_NOT_ALLOWED` — weekend booking disabled in rules
12. `DOUBLE_BOOKING` — slot overlaps a blocked interval
13. `INVALID_TIMEZONE` — timezone string is not a valid IANA name

## Emergency bookings

When `isEmergency=true` + `emergencyPolicy.enabled=true`:
- `minimumNoticeHours` → 0
- `maximumBookingDays` → 1 (today only)
- `sameDayBooking` → true
- `weekendBooking` → true

## Calendar providers

All providers implement `IBookingCalendarProvider`:

```typescript
interface IBookingCalendarProvider {
  name: CalendarProviderName;
  createEvent(event: CalendarEvent): Promise<string>;
  updateEvent(eventId: string, patch: Partial<CalendarEvent>): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  isAvailable(startUtc: string, endUtc: string): Promise<boolean>;
}
```

Register at startup:
```typescript
CalendarProviderRegistry.register(new GoogleCalendarProvider(orgId));
// or
CalendarProviderRegistry.register(new MockCalendarProvider()); // tests
```

## Booking events (reminder hooks)

The engine emits 3 event types — no reminder logic here, consumed by downstream layers:

| Event | When |
|-------|------|
| `booking_created` | After successful booking |
| `booking_rescheduled` | After reschedule |
| `booking_cancelled` | After cancellation |

```typescript
import { BookingEvents } from './booking-engine';
BookingEvents.on(event => {
  // Layer 10 Analytics, notification services, etc.
});
```

## Confirmation numbers

Deterministic: `LF-` + 8-char FNV-1a hex derived from `organizationId + guestName + startUtc + nowMs`. Same inputs always produce the same code within a session.

## Tests

```
src/booking-engine/__tests__/booking-engine.test.ts
  121 tests across 18 suites
```

Covers: BusinessHours, SlotGenerator, SlotValidator, BookingValidator,
BookingRulesService, BookingPolicy, ConfirmationBuilder, BookingSummaryBuilder,
MockCalendarProvider, CalendarProviderRegistry, BookingCoordinator,
TimezoneService, BookingEngine, integration lifecycle.
