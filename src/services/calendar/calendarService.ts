/**
 * calendarService.ts
 *
 * Calendar abstraction layer. All booking logic flows through this interface.
 * Swap the implementation (mockCalendarProvider) with a Google Calendar,
 * Outlook, or Apple Calendar adapter without touching any calling code.
 *
 * Business hours are read from businessSettings — no hardcoded values.
 */

import { TimeSlot, Appointment, BookingConfirmation, AppointmentType, BusinessHours, DaySchedule } from '../../types';
import { appointmentsApi } from '../api/appointments';
import { businessSettings } from '../business/businessSettings';

const DEFAULT_SLOT_DURATION = 60; // minutes
const SLOTS_TO_OFFER = 5;

// ─── Calendar Provider Interface ─────────────────────────────────────────────
// This interface is what you'd implement for Google Calendar, Outlook, etc.

export interface ICalendarProvider {
  getAvailableSlots(
    preferredDay: string | undefined,
    durationMinutes: number
  ): Promise<TimeSlot[]>;

  bookAppointment(params: BookParams): Promise<BookingConfirmation>;

  cancelAppointment(appointmentId: string): Promise<void>;

  rescheduleAppointment(
    appointmentId: string,
    newSlot: TimeSlot
  ): Promise<BookingConfirmation>;
}

export interface BookParams {
  slot: TimeSlot;
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  zipCode?: string;
  service: string;
  emergency: boolean;
  conversationId?: string;
  leadId?: string;
  notes?: string;
  duration?: number;
}

// ─── Mock Implementation ─────────────────────────────────────────────────────

const mockProvider: ICalendarProvider = {
  /**
   * Generate available slots starting from today (or the preferred day hint).
   * Business hours are read live from businessSettings.
   * Skips already-booked times from localStorage.
   */
  async getAvailableSlots(preferredDay, durationMinutes = DEFAULT_SLOT_DURATION): Promise<TimeSlot[]> {
    const settings = businessSettings.get();
    const hours = settings.businessHours;

    // Vacation mode — no slots
    if (hours.vacationMode) return [];

    const existing = await appointmentsApi.getAll();
    const booked = new Set(
      existing
        .filter(a => a.status !== 'Canceled')
        .map(a => `${a.date}|${a.time}`)
    );

    const now = new Date();
    const slots: TimeSlot[] = [];
    let daysChecked = 0;
    const dayBias = parseDayBias(preferredDay);

    while (slots.length < SLOTS_TO_OFFER && daysChecked < 14) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + daysChecked + dayBias);
      candidate.setHours(0, 0, 0, 0);
      daysChecked++;

      const schedule = getScheduleForDate(candidate, hours);
      if (!schedule) continue;

      const openHour  = parseInt(schedule.openTime.split(':')[0], 10);
      const closeHour = parseInt(schedule.closeTime.split(':')[0], 10);

      for (let hour = openHour; hour + durationMinutes / 60 <= closeHour; hour++) {
        const slotDate = new Date(candidate);
        slotDate.setHours(hour, 0, 0, 0);
        if (slotDate <= now) continue;

        const dateStr = formatDate(slotDate);
        const timeStr = `${String(hour).padStart(2, '0')}:00`;
        const key = `${dateStr}|${timeStr}`;

        if (!booked.has(key)) {
          slots.push({
            date: dateStr,
            time: timeStr,
            displayDate: formatDisplayDate(slotDate),
            displayTime: formatDisplayTime(hour),
            available: true
          });
          if (slots.length >= SLOTS_TO_OFFER) break;
        }
      }
    }

    return slots;
  },

  async bookAppointment(params: BookParams): Promise<BookingConfirmation> {
    const type = inferAppointmentType(params.service, params.emergency);
    const duration = params.duration ?? estimateDuration(params.service, params.emergency);
    const confirmationNumber = generateConfirmationNumber();

    const apt = await appointmentsApi.create({
      leadId: params.leadId ?? 'pending',
      leadName: params.customerName,
      leadPhone: params.phone,
      customerEmail: params.email,
      address: params.address,
      zipCode: params.zipCode,
      conversationId: params.conversationId,
      date: params.slot.date,
      time: params.slot.time,
      duration,
      type,
      status: 'Confirmed',
      notes: params.notes ?? `Booked via AI chat. Service: ${params.service}.`,
      confirmationNumber,
      source: 'AI Chat',
      value: estimateValue(params.service, params.emergency),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return {
      appointmentId: apt.id,
      confirmationNumber,
      customerName: params.customerName,
      service: params.service,
      date: params.slot.date,
      time: params.slot.time,
      displayDate: params.slot.displayDate,
      displayTime: params.slot.displayTime,
      estimatedDuration: duration,
      address: params.address
    };
  },

  async cancelAppointment(appointmentId: string): Promise<void> {
    await appointmentsApi.update(appointmentId, {
      status: 'Canceled',
      updatedAt: new Date().toISOString()
    });
  },

  async rescheduleAppointment(
    appointmentId: string,
    newSlot: TimeSlot
  ): Promise<BookingConfirmation> {
    const updated = await appointmentsApi.update(appointmentId, {
      date: newSlot.date,
      time: newSlot.time,
      status: 'Rescheduled',
      updatedAt: new Date().toISOString()
    });

    return {
      appointmentId: updated.id,
      confirmationNumber: updated.confirmationNumber ?? generateConfirmationNumber(),
      customerName: updated.leadName,
      service: updated.type,
      date: newSlot.date,
      time: newSlot.time,
      displayDate: newSlot.displayDate,
      displayTime: newSlot.displayTime,
      estimatedDuration: updated.duration,
      address: updated.address ?? ''
    };
  }
};

/** The singleton calendar service — swap `mockProvider` for a real adapter here. */
export const calendarService: ICalendarProvider = mockProvider;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the DaySchedule for a given date from businessSettings,
 * or null if that day is closed.
 */
function getScheduleForDate(date: Date, hours: BusinessHours): DaySchedule | null {
  const DOW_KEYS: (keyof BusinessHours)[] = [
    'sunday','monday','tuesday','wednesday','thursday','friday','saturday'
  ];
  const key = DOW_KEYS[date.getDay()];
  const day = hours[key] as DaySchedule | undefined;
  if (!day || !day.isOpen) return null;
  return day;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatDisplayTime(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:00 ${period}`;
}

function generateConfirmationNumber(): string {
  return `LF-${Math.random().toString(36).toUpperCase().substr(2, 7)}`;
}

/** Parse a free-text day preference into a day offset for slot generation */
function parseDayBias(preferred: string | undefined): number {
  if (!preferred) return 0;
  const lower = preferred.toLowerCase();
  if (lower.includes('today')) return 0;
  if (lower.includes('tomorrow')) return 1;
  if (lower.includes('weekend') || lower.includes('saturday')) return daysUntil(6);
  if (lower.includes('sunday')) return daysUntil(0);
  if (lower.includes('monday')) return daysUntil(1);
  if (lower.includes('tuesday')) return daysUntil(2);
  if (lower.includes('wednesday')) return daysUntil(3);
  if (lower.includes('thursday')) return daysUntil(4);
  if (lower.includes('friday')) return daysUntil(5);
  return 0;
}

function daysUntil(targetDow: number): number {
  const today = new Date().getDay();
  const diff = (targetDow - today + 7) % 7;
  return diff === 0 ? 7 : diff; // if today is the target, next occurrence
}

function inferAppointmentType(service: string, emergency: boolean): AppointmentType {
  if (emergency) return 'Emergency Service';
  const s = service.toLowerCase();
  if (s.includes('replace') || s.includes('install') || s.includes('new system') || s.includes('heat pump')) {
    return 'System Replacement Quote';
  }
  if (s.includes('maintenance') || s.includes('tune') || s.includes('cleaning')) return 'Maintenance';
  return 'Repair Consultation';
}

function estimateDuration(service: string, emergency: boolean): number {
  if (emergency) return 90;
  const s = service.toLowerCase();
  if (s.includes('replace') || s.includes('install')) return 240;
  if (s.includes('maintenance') || s.includes('tune')) return 60;
  return 90;
}

function estimateValue(service: string, emergency: boolean): number {
  const s = service.toLowerCase();
  if (s.includes('replace') || s.includes('install') || s.includes('new system')) return 8500;
  if (s.includes('heat pump')) return 5200;
  if (emergency || s.includes('repair') || s.includes('leak')) return 450;
  if (s.includes('maintenance') || s.includes('tune')) return 180;
  return 300;
}
