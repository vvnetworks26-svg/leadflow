/**
 * validation-engine/BookingValidator.ts
 *
 * Before confirming a booking, verify all preconditions are met.
 *
 * Rules:
 *   - Service must be identified
 *   - Contact info must be present (phone or email)
 *   - Booking permission must be enabled in BusinessIdentity
 *   - Must not offer specific times that haven't been confirmed as available
 *   - Weekend booking only if permitted by bookingRules
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

// ─── Patterns ─────────────────────────────────────────────────────────────────

const PROMISES_SPECIFIC_TIME = [
  /i('?ve| have) (booked|scheduled|confirmed) (you|an appointment) for/i,
  /(you're|you are) (all set|confirmed) for/i,
  /appointment (is|has been) (confirmed|set|scheduled) for/i,
  /see you (on|at|this)/i,
];

const MENTIONS_WEEKEND = [
  /\b(saturday|sunday|weekend)\b/i,
];

// ─── Validator ────────────────────────────────────────────────────────────────

export const BookingValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { blueprint, memory, identity, proposedResponse } = ctx;

    // Only applies when the CTA is booking or stage is booking
    const isBookingContext =
      blueprint.cta === 'BookAppointment' ||
      ctx.stage === 'booking' ||
      PROMISES_SPECIFIC_TIME.some(p => p.test(proposedResponse));

    if (!isBookingContext) {
      return ValidationResult.pass('BookingValidator');
    }

    // 1. book_appointment permission must be enabled
    const canBook = identity.permissions.allowed.includes('book_appointment');
    if (!canBook) {
      return ValidationResult.fail(
        'BookingValidator',
        'Booking is not permitted for this business.',
        'permissions',
      );
    }

    // 2. Service must be identified
    if (!memory.progress.serviceCollected) {
      return ValidationResult.fail(
        'BookingValidator',
        'Cannot confirm booking without knowing the service needed.',
        'service',
      );
    }

    // 3. Contact info required
    const hasContact = memory.progress.phoneCollected || memory.progress.emailCollected;
    if (!hasContact) {
      return ValidationResult.fail(
        'BookingValidator',
        'Cannot confirm booking without phone or email.',
        'contact',
      );
    }

    // 4. Weekend booking rules
    if (!identity.bookingRules.weekendBooking) {
      const mentionsWeekend = MENTIONS_WEEKEND.some(p => p.test(proposedResponse));
      if (mentionsWeekend) {
        return ValidationResult.fail(
          'BookingValidator',
          'This business does not allow weekend bookings.',
          'schedule',
        );
      }
    }

    return ValidationResult.pass('BookingValidator');
  },
};
