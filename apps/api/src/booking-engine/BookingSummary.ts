/**
 * booking-engine/BookingSummary.ts
 *
 * Generates human-readable booking summaries for the Response Engine.
 * Pure function — no I/O.
 */

import type { BookingConfirmation, BookingSummary, AvailabilityResponse } from './types';

export const BookingSummaryBuilder = {

  /**
   * Build a natural language summary from a confirmation.
   */
  fromConfirmation(
    confirmation: BookingConfirmation,
    businessName: string,
  ): BookingSummary {
    const nextStep = buildNextStep(confirmation.service, businessName);
    return {
      headline:           `Your ${confirmation.service} appointment is confirmed`,
      detail:             confirmation.appointmentTime,
      service:            confirmation.service,
      name:               confirmation.customerName,
      phone:              confirmation.customerPhone,
      email:              confirmation.customerEmail,
      confirmationNumber: confirmation.confirmationNumber,
      nextStep,
    };
  },

  /**
   * Build a natural language availability summary for the Response Engine.
   * Used when presenting slots to the customer.
   */
  availabilityMessage(availability: AvailabilityResponse): string {
    if (!availability.hasOpenSlots) {
      return "We don't have any available slots in the requested window. Would you like to check a different date?";
    }

    const slots = availability.suggested.slice(0, 3);
    if (slots.length === 0) return 'Let me check our schedule for you.';

    const lines = slots.map(s => `  • ${s.displayLabel}`).join('\n');
    const next  = availability.nextAvailable;

    if (slots.length === 1) {
      return `The next available appointment is ${next?.displayLabel ?? slots[0]!.displayLabel}. Does that work for you?`;
    }

    return `Here are our next available appointment times:\n${lines}\n\nWhich of these works best for you?`;
  },

  /**
   * Build a confirmed appointment reply string for the Response Engine.
   */
  confirmationMessage(summary: BookingSummary): string {
    const lines = [
      `✅ You're all set, ${summary.name}!`,
      ``,
      `📅 ${summary.detail}`,
      `🔧 ${summary.service}`,
      `📋 Confirmation #: ${summary.confirmationNumber}`,
      ``,
      summary.nextStep,
    ];
    return lines.join('\n');
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildNextStep(service: string, businessName: string): string {
  if (/emergency|urgent/i.test(service)) {
    return 'A technician will contact you shortly. Please keep your phone nearby.';
  }
  return `${businessName} will reach out to confirm. Thank you for choosing us!`;
}
