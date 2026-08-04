/**
 * booking-engine/BookingRules.ts
 *
 * Derives effective booking rules from BusinessIdentity.
 * Handles defaults, emergency overrides, and service-specific durations.
 *
 * PURE — no I/O, no side effects.
 */

import type { BookingRules as BookingRulesShape, BusinessIdentity } from '../business-identity/types';

export interface EffectiveBookingRules {
  readonly durationMinutes:     number;
  readonly slotIntervalMinutes: number;
  readonly minimumNoticeHours:  number;
  readonly maximumBookingDays:  number;
  readonly sameDayBooking:      boolean;
  readonly weekendBooking:      boolean;
  readonly bufferMinutes:       number;
  readonly isEmergencyOverride: boolean;
}

export const BookingRulesService = {

  forRequest(
    identity:    BusinessIdentity,
    serviceName: string,
    isEmergency: boolean = false,
  ): EffectiveBookingRules {
    const rules = identity.bookingRules;

    const catalogItem = identity.servicesCatalog.find(
      s => s.name.toLowerCase() === serviceName.toLowerCase() || s.id === serviceName
    );
    const durationMinutes = catalogItem?.estimatedDuration ?? rules.defaultDurationMins;

    if (isEmergency && identity.emergencyPolicy.enabled) {
      return {
        durationMinutes,
        slotIntervalMinutes: rules.slotIntervalMins,
        minimumNoticeHours:  0,
        maximumBookingDays:  1,
        sameDayBooking:      true,
        weekendBooking:      true,
        bufferMinutes:       0,
        isEmergencyOverride: true,
      };
    }

    return {
      durationMinutes,
      slotIntervalMinutes: rules.slotIntervalMins,
      minimumNoticeHours:  rules.minimumNoticeHours,
      maximumBookingDays:  rules.maximumBookingDays,
      sameDayBooking:      rules.sameDayBooking,
      weekendBooking:      rules.weekendBooking,
      bufferMinutes:       rules.businessBufferMins,
      isEmergencyOverride: false,
    };
  },

  toBookingRulesShape(effective: EffectiveBookingRules): BookingRulesShape {
    return {
      minimumNoticeHours:  effective.minimumNoticeHours,
      maximumBookingDays:  effective.maximumBookingDays,
      defaultDurationMins: effective.durationMinutes,
      slotIntervalMins:    effective.slotIntervalMinutes,
      sameDayBooking:      effective.sameDayBooking,
      weekendBooking:      effective.weekendBooking,
      businessBufferMins:  effective.bufferMinutes,
    };
  },
};
