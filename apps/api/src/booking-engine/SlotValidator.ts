/**
 * booking-engine/SlotValidator.ts
 *
 * Validates a proposed slot before booking is confirmed.
 *
 * PURE — no I/O, no side effects.
 */

import type { AppointmentSlot, BookingValidationResult, BlockedSlot } from './types';
import type { BusinessHours, BookingRules } from '../business-identity/types';
import { BusinessHoursService } from './BusinessHours';
import { isValidTimezone } from './TimezoneService';

export interface SlotValidationInput {
  readonly slot:         AppointmentSlot;
  readonly businessHours:BusinessHours;
  readonly bookingRules: BookingRules;
  readonly timezone:     string;
  readonly blockedSlots: readonly BlockedSlot[];
  readonly nowMs?:       number;
}

function overlaps(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const SlotValidator = {

  validate(input: SlotValidationInput): BookingValidationResult {
    const { slot, businessHours, bookingRules, timezone, blockedSlots, nowMs = Date.now() } = input;

    const startMs = new Date(slot.startUtc).getTime();
    const endMs   = new Date(slot.endUtc).getTime();

    // 1. Slot must be in the future
    if (startMs <= nowMs) {
      return { valid: false, code: 'SLOT_IN_PAST', reason: 'The requested slot is in the past.' };
    }

    // 2. Minimum notice
    const noticeMs = bookingRules.minimumNoticeHours * 3600_000;
    if (startMs - nowMs < noticeMs) {
      return {
        valid:  false,
        code:   'INSUFFICIENT_NOTICE',
        reason: `At least ${bookingRules.minimumNoticeHours} hour(s) notice required.`,
      };
    }

    // 3. Maximum advance booking
    const maxMs = nowMs + bookingRules.maximumBookingDays * 86400_000;
    if (startMs > maxMs) {
      return {
        valid:  false,
        code:   'OUTSIDE_ADVANCE_WINDOW',
        reason: `Cannot book more than ${bookingRules.maximumBookingDays} days in advance.`,
      };
    }

    // 4. Vacation mode
    if (businessHours.vacationMode) {
      return { valid: false, code: 'VACATION_MODE', reason: 'Business is in vacation mode.' };
    }

    // 5. Business open during the slot
    const isOpen = BusinessHoursService.slotIsWithinHours(
      businessHours, timezone, startMs, endMs,
    );
    if (!isOpen) {
      return { valid: false, code: 'BUSINESS_CLOSED', reason: 'The business is not open during this time slot.' };
    }

    // 6. Weekend rule
    if (!bookingRules.weekendBooking && BusinessHoursService.isWeekend(timezone, startMs)) {
      return { valid: false, code: 'WEEKEND_NOT_ALLOWED', reason: 'Weekend bookings are not permitted.' };
    }

    // 7. Timezone validity
    if (slot.timezone && !isValidTimezone(slot.timezone)) {
      return { valid: false, code: 'INVALID_TIMEZONE', reason: `Invalid timezone: ${slot.timezone}` };
    }

    // 8. Double-booking / conflict check
    const bufferMs = (bookingRules.businessBufferMins ?? 0) * 60_000;
    for (const blocked of blockedSlots) {
      const bStart = new Date(blocked.startUtc).getTime();
      const bEnd   = new Date(blocked.endUtc).getTime();
      if (overlaps(startMs - bufferMs, endMs + bufferMs, bStart, bEnd)) {
        return { valid: false, code: 'DOUBLE_BOOKING', reason: 'This time slot is already booked.' };
      }
    }

    return { valid: true };
  },
};
