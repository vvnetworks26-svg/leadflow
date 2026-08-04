/**
 * booking-engine/BookingCoordinator.ts
 *
 * Orchestrates the full booking lifecycle:
 *   1. Validate the booking request
 *   2. Create the calendar event (if provider available)
 *   3. Build the confirmation
 *   4. Emit the booking event
 *   5. Return the confirmation + summary
 *
 * This is the only coordinator-level file. It owns the booking flow.
 */

import type {
  BookingRequest,
  BookingConfirmation,
  BookingEvent,
  BlockedSlot,
} from './types';
import type { BusinessIdentity }         from '../business-identity/types';
import type { IBookingCalendarProvider } from './types';
import { BookingValidator }              from './BookingValidator';
import { ConfirmationBuilder }           from './BookingConfirmation';
import { BookingSummaryBuilder }         from './BookingSummary';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface CoordinatorResult {
  readonly success:      boolean;
  readonly confirmation: BookingConfirmation | null;
  readonly summary:      import('./types').BookingSummary | null;
  readonly event:        BookingEvent | null;
  readonly error?:       string;
  readonly errorCode?:   import('./types').BookingValidationCode;
}

// ─── Event emitter (fire-and-forget) ─────────────────────────────────────────

type BookingEventHandler = (event: BookingEvent) => void;
const _handlers: BookingEventHandler[] = [];

export const BookingEvents = {
  on(handler: BookingEventHandler): void {
    _handlers.push(handler);
  },
  off(handler: BookingEventHandler): void {
    const idx = _handlers.indexOf(handler);
    if (idx >= 0) _handlers.splice(idx, 1);
  },
  emit(event: BookingEvent): void {
    for (const h of _handlers) {
      try { h(event); } catch { /* ignore handler errors */ }
    }
  },
  /** Remove all handlers (for test isolation). */
  reset(): void {
    _handlers.length = 0;
  },
};

// ─── Coordinator ──────────────────────────────────────────────────────────────

export const BookingCoordinator = {

  /**
   * Execute a complete booking.
   *
   * @param request      - The booking request from the Conversation Engine
   * @param identity     - BusinessIdentity (Layer 1)
   * @param blockedSlots - Already-booked slots (from DB or injected for tests)
   * @param provider     - Optional calendar provider (null in unit tests)
   * @param nowMs        - Injectable clock for deterministic tests
   */
  async book(
    request:      BookingRequest,
    identity:     BusinessIdentity,
    blockedSlots: readonly BlockedSlot[] = [],
    provider:     IBookingCalendarProvider | null = null,
    nowMs:        number = Date.now(),
  ): Promise<CoordinatorResult> {

    // Step 1: Validate
    const validation = BookingValidator.validate({
      request: { ...request, nowMs },
      identity,
      blockedSlots,
      nowMs,
    });

    if (!validation.valid) {
      return {
        success:      false,
        confirmation: null,
        summary:      null,
        event:        null,
        error:        validation.reason,
        errorCode:    validation.code,
      };
    }

    // Step 2: Create calendar event (optional — skip if no provider)
    let externalEventId: string | undefined;
    if (provider) {
      try {
        externalEventId = await provider.createEvent({
          title:       `${request.service} — ${request.guestName}`,
          startUtc:    request.requestedSlot.startUtc,
          endUtc:      request.requestedSlot.endUtc,
          description: [
            `Customer: ${request.guestName}`,
            `Phone: ${request.guestPhone}`,
            request.guestEmail ? `Email: ${request.guestEmail}` : '',
            request.notes ? `Notes: ${request.notes}` : '',
          ].filter(Boolean).join('\n'),
          attendees:   [
            request.guestEmail,
            identity.contactInfo.email,
          ].filter((e): e is string => Boolean(e)),
          location:    identity.contactInfo.address,
        });
      } catch {
        // Calendar event failure is non-blocking — booking still proceeds
      }
    }

    // Step 3: Build confirmation
    const confirmation = ConfirmationBuilder.build(
      request,
      identity.companyProfile.businessName,
      externalEventId,
      nowMs,
    );

    // Step 4: Build summary
    const summary = BookingSummaryBuilder.fromConfirmation(
      confirmation,
      identity.companyProfile.businessName,
    );

    // Step 5: Emit event (fire-and-forget — Layer 10 Analytics consumes this)
    const event: BookingEvent = {
      type:           'booking_created',
      organizationId: request.organizationId,
      conversationId: request.conversationId,
      confirmation,
      occurredAt:     new Date(nowMs).toISOString(),
    };
    BookingEvents.emit(event);

    return { success: true, confirmation, summary, event };
  },

  /**
   * Cancel a booking and emit the cancellation event.
   */
  async cancel(
    confirmation: BookingConfirmation,
    organizationId: string,
    conversationId: string,
    provider: IBookingCalendarProvider | null = null,
    nowMs: number = Date.now(),
  ): Promise<void> {
    // Delete calendar event if we have an ID
    if (provider && confirmation.bookingId) {
      try { await provider.deleteEvent(confirmation.bookingId); } catch {}
    }

    const event: BookingEvent = {
      type:           'booking_cancelled',
      organizationId,
      conversationId,
      confirmation:   { ...confirmation, status: 'cancelled' },
      occurredAt:     new Date(nowMs).toISOString(),
    };
    BookingEvents.emit(event);
  },

  /**
   * Reschedule a booking and emit the rescheduled event.
   */
  async reschedule(
    original:      BookingConfirmation,
    newRequest:    BookingRequest,
    identity:      BusinessIdentity,
    blockedSlots:  readonly BlockedSlot[] = [],
    provider:      IBookingCalendarProvider | null = null,
    nowMs:         number = Date.now(),
  ): Promise<CoordinatorResult> {
    // Validate the new slot
    const result = await BookingCoordinator.book(
      newRequest, identity, blockedSlots, provider, nowMs,
    );

    if (!result.success || !result.confirmation) return result;

    // Delete old calendar event
    if (provider && original.bookingId) {
      try { await provider.deleteEvent(original.bookingId); } catch {}
    }

    const event: BookingEvent = {
      type:           'booking_rescheduled',
      organizationId: newRequest.organizationId,
      conversationId: newRequest.conversationId,
      confirmation:   result.confirmation,
      occurredAt:     new Date(nowMs).toISOString(),
    };
    BookingEvents.emit(event);

    return result;
  },
};
