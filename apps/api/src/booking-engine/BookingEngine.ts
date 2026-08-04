/**
 * booking-engine/BookingEngine.ts
 *
 * Layer 8 — Public entry point.
 *
 * The Conversation Engine (Decision Engine) calls this.
 * No other layer performs scheduling logic.
 *
 * Usage:
 *
 *   // Get available slots
 *   const availability = await BookingEngine.getAvailability(identity, { nowMs });
 *
 *   // Book an appointment
 *   const result = await BookingEngine.book(request, identity, blockedSlots);
 *   if (result.success) {
 *     reply = BookingSummaryBuilder.confirmationMessage(result.summary!);
 *   }
 */

import type { BusinessIdentity }                             from '../business-identity/types';
import type { BookingRequest, AvailabilityResponse, BlockedSlot, AppointmentSlot } from './types';
import type { IBookingCalendarProvider }                     from './types';
import { AvailabilityService }                               from './AvailabilityService';
import { BookingCoordinator, type CoordinatorResult }        from './BookingCoordinator';
import { BookingRulesService }                               from './BookingRules';
import { BookingPolicy }                                     from './BookingPolicy';
import { CalendarProviderRegistry }                          from './CalendarProvider';

// ─── Availability options ─────────────────────────────────────────────────────

export interface GetAvailabilityOptions {
  /** Override start date (YYYY-MM-DD). Defaults to today. */
  readonly startDate?:    string;
  /** Override end date (YYYY-MM-DD). Defaults to +7 days. */
  readonly endDate?:      string;
  /** Customer's display timezone. */
  readonly guestTimezone?:string;
  /** Already-booked slots to treat as blocked. */
  readonly blockedSlots?: readonly BlockedSlot[];
  /** Service name (for duration lookup). */
  readonly service?:      string;
  /** Is this an emergency booking? */
  readonly isEmergency?:  boolean;
  /** Calendar provider override (use registered default if not provided). */
  readonly provider?:     IBookingCalendarProvider | null;
  /** Injectable clock. */
  readonly nowMs?:        number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const BookingEngine = {

  /**
   * Get available appointment slots for a business.
   */
  async getAvailability(
    identity: BusinessIdentity,
    opts:     GetAvailabilityOptions = {},
  ): Promise<AvailabilityResponse> {
    const nowMs    = opts.nowMs ?? Date.now();
    const today    = new Date(nowMs).toISOString().slice(0, 10);
    const start    = opts.startDate ?? today;

    const effective = BookingRulesService.forRequest(
      identity,
      opts.service ?? '',
      opts.isEmergency ?? false,
    );

    const req = {
      organizationId: identity.organizationId,
      businessHours:  identity.businessHours,
      bookingRules:   BookingRulesService.toBookingRulesShape(effective),
      timezone:       identity.contactInfo.timezone,
      guestTimezone:  opts.guestTimezone,
      durationMinutes:effective.durationMinutes,
      blockedSlots:   opts.blockedSlots ?? [],
      startDateUtc:   start,
      endDateUtc:     opts.endDate,
      nowMs,
    };

    const provider = opts.provider ?? CalendarProviderRegistry.default();
    return AvailabilityService.getSlots(req, provider);
  },

  /**
   * Book an appointment.
   */
  async book(
    request:      BookingRequest,
    identity:     BusinessIdentity,
    blockedSlots: readonly BlockedSlot[] = [],
    provider?:    IBookingCalendarProvider | null,
  ): Promise<CoordinatorResult> {
    const p = provider ?? CalendarProviderRegistry.default();
    return BookingCoordinator.book(request, identity, blockedSlots, p, request.nowMs);
  },

  /**
   * Cancel a booking.
   */
  async cancel(
    confirmation:   import('./types').BookingConfirmation,
    organizationId: string,
    conversationId: string,
    provider?:      IBookingCalendarProvider | null,
  ): Promise<void> {
    const p = provider ?? CalendarProviderRegistry.default();
    return BookingCoordinator.cancel(confirmation, organizationId, conversationId, p);
  },

  /**
   * Reschedule a booking.
   */
  async reschedule(
    original:     import('./types').BookingConfirmation,
    newRequest:   BookingRequest,
    identity:     BusinessIdentity,
    blockedSlots: readonly BlockedSlot[] = [],
    provider?:    IBookingCalendarProvider | null,
  ): Promise<CoordinatorResult> {
    const p = provider ?? CalendarProviderRegistry.default();
    return BookingCoordinator.reschedule(original, newRequest, identity, blockedSlots, p, newRequest.nowMs);
  },

  /**
   * Quick check: can this business accept bookings right now?
   */
  canBook(identity: BusinessIdentity): boolean {
    return BookingPolicy.canBook(identity).allowed;
  },

  /**
   * Get the display-ready next available slot string.
   */
  async getNextSlotLabel(
    identity: BusinessIdentity,
    opts:     GetAvailabilityOptions = {},
  ): Promise<string | null> {
    const avail = await BookingEngine.getAvailability(identity, opts);
    return avail.nextAvailable?.displayLabel ?? null;
  },
};
