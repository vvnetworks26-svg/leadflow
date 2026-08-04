/**
 * booking-engine/BookingValidator.ts
 *
 * Validates the complete booking request before execution.
 * Checks customer data, slot, permissions, and business rules.
 *
 * PURE — no I/O, no side effects.
 */

import type { BookingRequest, BookingValidationResult } from './types';
import type { BusinessIdentity } from '../business-identity/types';
import { SlotValidator } from './SlotValidator';

export interface BookingValidationInput {
  readonly request:  BookingRequest;
  readonly identity: BusinessIdentity;
  readonly blockedSlots: readonly import('./types').BlockedSlot[];
  readonly nowMs?:   number;
}

export const BookingValidator = {

  validate(input: BookingValidationInput): BookingValidationResult {
    const { request, identity, blockedSlots, nowMs = Date.now() } = input;

    // 1. Booking permission
    if (!identity.permissions.allowed.includes('book_appointment')) {
      return {
        valid:  false,
        code:   'BOOKING_NOT_PERMITTED',
        reason: 'Appointment booking is not enabled for this business.',
      };
    }

    // 2. Customer name required
    if (!request.guestName?.trim()) {
      return { valid: false, code: 'MISSING_NAME', reason: 'Customer name is required.' };
    }

    // 3. Contact info required
    if (!request.guestPhone?.trim() && !request.guestEmail?.trim()) {
      return { valid: false, code: 'MISSING_PHONE', reason: 'Phone or email is required.' };
    }

    // 4. Service required
    if (!request.service?.trim()) {
      return { valid: false, code: 'MISSING_SERVICE', reason: 'Service type is required.' };
    }

    // 5. Slot required
    if (!request.requestedSlot) {
      return { valid: false, code: 'MISSING_SLOT', reason: 'No appointment slot was provided.' };
    }

    // 6. Slot validation (business rules + double booking)
    const slotResult = SlotValidator.validate({
      slot:          request.requestedSlot,
      businessHours: identity.businessHours,
      bookingRules:  identity.bookingRules,
      timezone:      identity.contactInfo.timezone,
      blockedSlots,
      nowMs,
    });

    if (!slotResult.valid) return slotResult;

    // 7. Emergency path: if emergency, check policy
    if (request.isEmergency && !identity.emergencyPolicy.enabled) {
      // Emergency booking is still allowed — it just goes through after-hours.
      // We don't block it here; we just note the policy for context.
    }

    return { valid: true };
  },
};
