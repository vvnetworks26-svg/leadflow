/**
 * booking-engine/OutlookCalendarProvider.ts
 *
 * Outlook / Microsoft 365 Calendar adapter for the Booking Engine.
 * Wraps the existing Microsoft365Provider behind IBookingCalendarProvider.
 *
 * In unit tests, use MockCalendarProvider instead.
 */

import type { CalendarEvent, IBookingCalendarProvider } from './types';

export class OutlookCalendarProvider implements IBookingCalendarProvider {
  readonly name = 'outlook' as const;

  constructor(
    private readonly organizationId: string,
    private readonly calendarId:     string = 'primary',
  ) {}

  private async _provider(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../calendar/providers/Microsoft365Provider');
    return new mod.Microsoft365Provider(this.organizationId);
  }

  async createEvent(event: CalendarEvent): Promise<string> {
    const p = await this._provider();
    return p.createEvent(this.calendarId, {
      title:           event.title,
      description:     event.description,
      startUtc:        new Date(event.startUtc),
      endUtc:          new Date(event.endUtc),
      location:        event.location ?? '',
      attendees:       [...event.attendees],
      meetingLink:     '',
      reminderMinutes: [60, 15],
    });
  }

  async updateEvent(eventId: string, patch: Partial<CalendarEvent>): Promise<void> {
    const p = await this._provider();
    await p.updateEvent(this.calendarId, {
      eventId,
      ...(patch.startUtc && { startUtc: new Date(patch.startUtc) }),
      ...(patch.endUtc   && { endUtc:   new Date(patch.endUtc) }),
      ...(patch.title    && { title:    patch.title }),
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    const p = await this._provider();
    await p.deleteEvent(this.calendarId, eventId);
  }

  async isAvailable(startUtc: string, endUtc: string): Promise<boolean> {
    try {
      const p    = await this._provider();
      const busy = await p.getBusyIntervals(
        [this.calendarId],
        new Date(startUtc),
        new Date(endUtc),
      );
      return busy.length === 0;
    } catch {
      return true;
    }
  }
}
