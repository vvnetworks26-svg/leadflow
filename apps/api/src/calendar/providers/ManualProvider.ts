/**
 * ManualProvider.ts
 *
 * Fallback provider for organizations not connected to an external calendar.
 * Uses the local Booking/Appointment records as the source of busy time.
 * No OAuth required.
 */

import type { ICalendarProvider, CreateEventInput, UpdateEventInput, CalendarList, BusyInterval } from './ICalendarProvider';
import { BookingModel }      from '../../models/Booking.model';
import { AppointmentModel }  from '../../models/Appointment.model';

export class ManualProvider implements ICalendarProvider {
  readonly name = 'manual';

  constructor(
    private organizationId: string,
    private assigneeId:     string,
  ) {}

  async isConnected(): Promise<boolean> { return true; }
  async refreshTokenIfNeeded(): Promise<void> { return; }

  async listCalendars(): Promise<CalendarList[]> {
    return [{ id: 'local', name: 'LeadFlow Calendar', primary: true, color: '#6366f1' }];
  }

  async getBusyIntervals(_calendarIds: string[], startUtc: Date, endUtc: Date): Promise<BusyInterval[]> {
    const [bookings, appointments] = await Promise.all([
      BookingModel.find({
        organizationId: this.organizationId,
        assigneeId:     this.assigneeId,
        status:         { $in: ['confirmed', 'rescheduled'] },
        startUtc:       { $gte: startUtc },
        endUtc:         { $lte: endUtc },
      }).lean(),
      AppointmentModel.find({
        organizationId: this.organizationId,
        status:         { $in: ['Scheduled', 'Confirmed'] },
        date:           {
          $gte: startUtc.toISOString().slice(0, 10),
          $lte: endUtc.toISOString().slice(0, 10),
        },
      }).lean(),
    ]);

    const intervals: BusyInterval[] = bookings.map(b => ({
      startUtc: b.startUtc,
      endUtc:   b.endUtc,
      source:   'leadflow_bookings',
    }));

    for (const appt of appointments) {
      const start = new Date(`${appt.date}T${appt.time}:00Z`);
      const end   = new Date(start.getTime() + appt.duration * 60_000);
      intervals.push({ startUtc: start, endUtc: end, source: 'leadflow_appointments' });
    }

    return intervals;
  }

  async createEvent(_calendarId: string, _input: CreateEventInput): Promise<string> {
    return `manual-${Date.now()}`;
  }

  async updateEvent(_calendarId: string, _input: UpdateEventInput): Promise<void> { return; }
  async deleteEvent(_calendarId: string, _eventId: string): Promise<void>         { return; }
}
