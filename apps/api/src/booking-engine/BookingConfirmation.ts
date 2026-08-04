/**
 * booking-engine/BookingConfirmation.ts
 *
 * Generates deterministic booking confirmation objects and summaries.
 * No randomness — confirmation numbers are derived from inputs.
 *
 * PURE — no I/O, no side effects.
 */

import type { BookingRequest, BookingConfirmation, BookingSummary } from './types';
import { formatConfirmationTime, safeTimezone } from './TimezoneService';

// ─── Confirmation number ──────────────────────────────────────────────────────

function generateConfirmationNumber(
  organizationId: string,
  guestName:      string,
  startUtc:       string,
  nowMs:          number,
): string {
  const input = `${organizationId}|${guestName.toLowerCase()}|${startUtc}|${nowMs}`;
  let   hash  = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash  = (hash * 0x01000193) >>> 0;
  }
  return `LF-${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

// ─── Next steps ───────────────────────────────────────────────────────────────

function buildNextStep(service: string, businessName: string): string {
  if (/emergency|urgent|burst|no heat|no cool/i.test(service)) {
    return `A technician will be in touch shortly. Keep your phone nearby.`;
  }
  return `${businessName} will contact you to confirm. Please keep your phone available.`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ConfirmationBuilder = {

  build(
    request:      BookingRequest,
    businessName: string,
    bookingId?:   string,
    nowMs:        number = Date.now(),
  ): BookingConfirmation {
    const tz = safeTimezone(request.guestTimezone ?? request.requestedSlot.timezone);
    const confirmationNumber = generateConfirmationNumber(
      request.organizationId,
      request.guestName,
      request.requestedSlot.startUtc,
      nowMs,
    );

    return {
      confirmationNumber,
      appointmentTime: formatConfirmationTime(request.requestedSlot.startUtc, tz),
      timezone:        tz,
      service:         request.service,
      customerName:    request.guestName,
      customerPhone:   request.guestPhone,
      customerEmail:   request.guestEmail,
      durationMinutes: request.requestedSlot.durationMinutes,
      status:          'confirmed',
      notes:           request.notes,
      bookingId,
      createdAt:       new Date(nowMs).toISOString(),
    };
  },

  summary(
    confirmation: BookingConfirmation,
    businessName: string,
  ): BookingSummary {
    return {
      headline:           `Your ${confirmation.service} appointment is confirmed`,
      detail:             confirmation.appointmentTime,
      service:            confirmation.service,
      name:               confirmation.customerName,
      phone:              confirmation.customerPhone,
      email:              confirmation.customerEmail,
      confirmationNumber: confirmation.confirmationNumber,
      nextStep:           buildNextStep(confirmation.service, businessName),
    };
  },
};
