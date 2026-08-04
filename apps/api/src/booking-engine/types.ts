/**
 * booking-engine/types.ts
 *
 * Layer 8 — Booking Engine domain types.
 * Single source of truth. No business logic. Types only.
 */

import type { BusinessHours, BookingRules, EmergencyPolicy, ServiceCatalogItem } from '../business-identity/types';

// ─── Booking status ───────────────────────────────────────────────────────────

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'no_show';

// ─── Slot ─────────────────────────────────────────────────────────────────────

/** A resolved, displayable appointment slot */
export interface AppointmentSlot {
  readonly startUtc:        string;   // ISO string
  readonly endUtc:          string;   // ISO string
  readonly startLocal:      string;   // ISO in business timezone
  readonly endLocal:        string;
  readonly displayLabel:    string;   // "Tuesday, Aug 5 at 2:00 PM"
  readonly timezone:        string;   // IANA
  readonly durationMinutes: number;
  readonly available:       boolean;
}

// ─── Availability request ─────────────────────────────────────────────────────

export interface AvailabilityRequest {
  readonly organizationId:   string;
  readonly businessHours:    BusinessHours;
  readonly bookingRules:     BookingRules;
  readonly timezone:         string;          // business IANA timezone
  readonly guestTimezone?:   string;          // customer display timezone
  readonly durationMinutes?: number;          // override catalog duration
  readonly blockedSlots:     readonly BlockedSlot[];
  readonly startDateUtc:     string;          // ISO date YYYY-MM-DD
  readonly endDateUtc?:      string;          // ISO date YYYY-MM-DD (default +7 days)
  /** Injectable clock for deterministic testing */
  readonly nowMs?:           number;
}

export interface BlockedSlot {
  readonly startUtc: string;
  readonly endUtc:   string;
  readonly reason?:  string;
}

export interface AvailabilityResponse {
  readonly slots:         readonly AppointmentSlot[];
  readonly nextAvailable: AppointmentSlot | null;
  readonly suggested:     readonly AppointmentSlot[];  // top 3
  readonly hasOpenSlots:  boolean;
  readonly rangeStart:    string;
  readonly rangeEnd:      string;
}

// ─── Booking request ──────────────────────────────────────────────────────────

export interface BookingRequest {
  readonly organizationId:   string;
  readonly conversationId:   string;
  readonly guestName:        string;
  readonly guestPhone:       string;
  readonly guestEmail?:      string;
  readonly guestTimezone?:   string;
  readonly service:          string;
  readonly serviceId?:       string;
  readonly requestedSlot:    AppointmentSlot;
  readonly notes?:           string;
  readonly leadId?:          string;
  readonly isEmergency?:     boolean;
  /** Injectable clock for deterministic testing */
  readonly nowMs?:           number;
}

// ─── Booking confirmation ─────────────────────────────────────────────────────

export interface BookingConfirmation {
  readonly confirmationNumber: string;
  readonly appointmentTime:    string;   // "Tuesday, Aug 5 at 2:00 PM CDT"
  readonly timezone:           string;
  readonly service:            string;
  readonly customerName:       string;
  readonly customerPhone:      string;
  readonly customerEmail?:     string;
  readonly durationMinutes:    number;
  readonly status:             BookingStatus;
  readonly notes?:             string;
  readonly bookingId?:         string;   // DB record ID (if persisted)
  readonly createdAt:          string;   // ISO
}

// ─── Booking summary ──────────────────────────────────────────────────────────

export interface BookingSummary {
  readonly headline:    string;   // "Your HVAC appointment is confirmed"
  readonly detail:      string;   // "Tuesday, Aug 5 at 2:00 PM CDT"
  readonly service:     string;
  readonly name:        string;
  readonly phone:       string;
  readonly email?:      string;
  readonly confirmationNumber: string;
  readonly nextStep:    string;   // what the customer should expect
}

// ─── Booking event ────────────────────────────────────────────────────────────

export type BookingEventType =
  | 'booking_created'
  | 'booking_rescheduled'
  | 'booking_cancelled';

export interface BookingEvent {
  readonly type:           BookingEventType;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly confirmation:   BookingConfirmation;
  readonly occurredAt:     string;  // ISO
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type BookingValidationCode =
  | 'MISSING_NAME'
  | 'MISSING_PHONE'
  | 'MISSING_SERVICE'
  | 'MISSING_SLOT'
  | 'SLOT_EXPIRED'
  | 'SLOT_IN_PAST'
  | 'SLOT_UNAVAILABLE'
  | 'DOUBLE_BOOKING'
  | 'BUSINESS_CLOSED'
  | 'BOOKING_NOT_PERMITTED'
  | 'OUTSIDE_ADVANCE_WINDOW'
  | 'INSUFFICIENT_NOTICE'
  | 'WEEKEND_NOT_ALLOWED'
  | 'INVALID_TIMEZONE'
  | 'VACATION_MODE';

export interface BookingValidationResult {
  readonly valid:    boolean;
  readonly code?:    BookingValidationCode;
  readonly reason?:  string;
}

// ─── Calendar provider ────────────────────────────────────────────────────────

export interface CalendarEvent {
  readonly title:       string;
  readonly startUtc:    string;
  readonly endUtc:      string;
  readonly description: string;
  readonly attendees:   readonly string[];
  readonly location?:   string;
}

export type CalendarProviderName = 'google' | 'outlook' | 'mock';

export interface IBookingCalendarProvider {
  readonly name: CalendarProviderName;
  createEvent(event: CalendarEvent): Promise<string>;   // returns external event ID
  updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  isAvailable(startUtc: string, endUtc: string): Promise<boolean>;
}
