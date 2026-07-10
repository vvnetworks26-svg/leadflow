/**
 * MeetingService.ts
 *
 * Creates, updates, and deletes calendar events on external providers.
 * Called fire-and-forget from BookingService.
 */

import { CalendarConnectionModel } from '../../models/CalendarConnection.model';
import { getProviderForUser }      from '../providers/ProviderFactory';
import { BookingModel }            from '../../models/Booking.model';
import { logger }                  from '../../utils/logger';
import type { IBooking }           from '../../models/Booking.model';

export const MeetingService = {

  async createExternalEvent(organizationId: string, booking: IBooking): Promise<void> {
    try {
      const conn = await CalendarConnectionModel.findOne({
        organizationId, userId: booking.assigneeId, status: 'connected',
      }).lean();
      if (!conn) return;

      const provider = await getProviderForUser(organizationId, booking.assigneeId);
      const calId    = conn.primaryCalendarId ?? conn.calendarIds[0];
      if (!calId) return;

      const eventId = await provider.createEvent(calId, {
        title:           `${booking.meetingTypeName} with ${booking.guestName}`,
        description:     [
          `Guest: ${booking.guestName} (${booking.guestEmail})`,
          booking.notes ? `Notes: ${booking.notes}` : '',
          `Booking ID: ${booking.id}`,
          `Confirmation: ${booking.confirmationCode}`,
        ].filter(Boolean).join('\n'),
        startUtc:        booking.startUtc,
        endUtc:          booking.endUtc,
        location:        booking.location || booking.videoLink,
        attendees:       [booking.guestEmail],
        meetingLink:     booking.videoLink,
        reminderMinutes: [24 * 60, 60, 15],
      });

      await BookingModel.findByIdAndUpdate(booking.id, {
        externalEventId:  eventId,
        externalProvider: conn.provider,
      });
    } catch (err) {
      logger.warn({ err, bookingId: booking.id }, '[MeetingService] createExternalEvent failed');
    }
  },

  async updateExternalEvent(organizationId: string, booking: IBooking): Promise<void> {
    if (!booking.externalEventId) return;
    try {
      const provider = await getProviderForUser(organizationId, booking.assigneeId);
      const conn     = await CalendarConnectionModel.findOne({
        organizationId, userId: booking.assigneeId, status: 'connected',
      }).lean();
      const calId    = conn?.primaryCalendarId ?? conn?.calendarIds[0];
      if (!calId) return;

      await provider.updateEvent(calId, {
        eventId:  booking.externalEventId,
        startUtc: booking.startUtc,
        endUtc:   booking.endUtc,
      });
    } catch (err) {
      logger.warn({ err, bookingId: booking.id }, '[MeetingService] updateExternalEvent failed');
    }
  },

  async deleteExternalEvent(organizationId: string, booking: IBooking): Promise<void> {
    if (!booking.externalEventId) return;
    try {
      const provider = await getProviderForUser(organizationId, booking.assigneeId);
      const conn     = await CalendarConnectionModel.findOne({
        organizationId, userId: booking.assigneeId, status: 'connected',
      }).lean();
      const calId    = conn?.primaryCalendarId ?? conn?.calendarIds[0];
      if (!calId) return;

      await provider.deleteEvent(calId, booking.externalEventId);
    } catch (err) {
      logger.warn({ err, bookingId: booking.id }, '[MeetingService] deleteExternalEvent failed');
    }
  },
};
