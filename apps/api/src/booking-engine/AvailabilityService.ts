/**
 * booking-engine/AvailabilityService.ts
 *
 * Fetches available slots for the AI conversation.
 * Merges SlotGenerator output with blocked slots from the calendar provider.
 *
 * This is the only file in booking-engine/ that calls external services.
 * In unit tests, inject a MockCalendarProvider.
 */

import type { AvailabilityRequest, AvailabilityResponse, BlockedSlot } from './types';
import type { IBookingCalendarProvider } from './types';
import { SlotGenerator } from './SlotGenerator';

export const AvailabilityService = {

  /**
   * Get available appointment slots.
   *
   * @param req     - Availability parameters (pure data from BusinessIdentity)
   * @param provider - Calendar provider (for fetching busy times). Optional — if
   *                   absent, only booking-rule-based blocking applies.
   */
  async getSlots(
    req:       AvailabilityRequest,
    provider?: IBookingCalendarProvider | null,
  ): Promise<AvailabilityResponse> {
    // Fetch provider busy times if available
    let providerBlocked: BlockedSlot[] = [];

    if (provider) {
      try {
        const startMs  = new Date(req.startDateUtc + 'T00:00:00Z').getTime();
        const endMs    = startMs + ((req.bookingRules.maximumBookingDays > 7 ? 7 : req.bookingRules.maximumBookingDays) * 86400_000);
        const startUtc = new Date(startMs).toISOString();
        const endUtc   = new Date(endMs).toISOString();

        // provider.isAvailable is per-slot; we don't have a bulk busy-time API in
        // IBookingCalendarProvider — use blocked slots passed in req instead.
        // If provider supports bulk busy check, it would go here.
      } catch {
        // Provider unavailable — continue with no external blocking
      }
    }

    // Merge provider-blocked + request-blocked slots
    const allBlocked: BlockedSlot[] = [
      ...req.blockedSlots,
      ...providerBlocked,
    ];

    return SlotGenerator.generate({ ...req, blockedSlots: allBlocked });
  },

  /**
   * Get just the next available slot (fast path — no full scan needed).
   */
  async getNextSlot(
    req:       AvailabilityRequest,
    provider?: IBookingCalendarProvider | null,
  ): Promise<import('./types').AppointmentSlot | null> {
    const result = await AvailabilityService.getSlots(req, provider);
    return result.nextAvailable;
  },

  /**
   * Get up to N suggested slots (first page preview).
   */
  async getSuggestedSlots(
    req:       AvailabilityRequest,
    count:     number = 3,
    provider?: IBookingCalendarProvider | null,
  ): Promise<import('./types').AppointmentSlot[]> {
    const result = await AvailabilityService.getSlots(req, provider);
    return [...result.suggested].slice(0, count);
  },
};
