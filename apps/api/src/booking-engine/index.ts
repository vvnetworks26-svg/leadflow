/**
 * booking-engine/index.ts — public API surface for Layer 8
 */

// Primary entry points
export { BookingEngine }               from './BookingEngine';
export { BookingCoordinator, BookingEvents } from './BookingCoordinator';
export { AvailabilityService }         from './AvailabilityService';

// Core engines (pure)
export { SlotGenerator }               from './SlotGenerator';
export { SlotValidator }               from './SlotValidator';
export { BookingValidator }            from './BookingValidator';
export { ConfirmationBuilder }         from './BookingConfirmation';
export { BookingSummaryBuilder }       from './BookingSummary';

// Rules and policy
export { BookingRulesService }             from './BookingRules';
export { BookingPolicy }                   from './BookingPolicy';
export { BusinessHoursService }            from './BusinessHours';

// Calendar providers
export { CalendarProviderRegistry }    from './CalendarProvider';
export { MockCalendarProvider }        from './MockCalendarProvider';
export { GoogleCalendarProvider }      from './GoogleCalendarProvider';
export { OutlookCalendarProvider }     from './OutlookCalendarProvider';

// Timezone
export {
  formatSlotLabel,
  formatConfirmationTime,
  utcOffsetLabel,
  safeTimezone,
  isValidTimezone,
} from './TimezoneService';

// Types
export type {
  BookingRequest,
  BookingConfirmation as BookingConfirmationType,
  BookingSummary,
  BookingStatus,
  BookingEvent,
  BookingEventType,
  BookingValidationResult,
  BookingValidationCode,
  AppointmentSlot,
  AvailabilityRequest,
  AvailabilityResponse,
  BlockedSlot,
  CalendarEvent,
  CalendarProviderName,
  IBookingCalendarProvider,
} from './types';

export type { CoordinatorResult }      from './BookingCoordinator';
export type { EffectiveBookingRules }  from './BookingRules';
export type { SlotValidationInput }    from './SlotValidator';
export type { BookingValidationInput } from './BookingValidator';
export type { GetAvailabilityOptions } from './BookingEngine';
