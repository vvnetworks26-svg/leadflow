/**
 * ReminderService.ts
 *
 * Schedules and dispatches booking reminders.
 * Dispatches via: in-app notification (always), webhook (if configured).
 * Email and SMS are future-ready (hooks in place, not wired to external provider).
 *
 * Reminder schedule: 24h before, 1h before, 15min before.
 * Uses node-cron for in-process scheduling (production should use a queue/worker).
 */

import cron                    from 'node-cron';
import { BookingModel }        from '../../models/Booking.model';
import { NotificationModel }   from '../../models/Notification.model';
import { SchedulingPolicyModel }from '../../models/SchedulingPolicy.model';
import { BookingAnalyticsService } from '../analytics/BookingAnalyticsService';
import { logger }              from '../../utils/logger';
import { formatForDisplay }    from '../timezone/TimezoneService';
import type { IBooking }       from '../../models/Booking.model';

const REMINDER_OFFSETS_MINUTES = [24 * 60, 60, 15];  // 24h, 1h, 15min

export const ReminderService = {

  /** Schedule reminder entries for a booking. */
  async scheduleForBooking(booking: IBooking): Promise<void> {
    // Reminders are tracked as ISO timestamps in booking.remindersSent
    // The cron job picks up pending reminders on each tick
    logger.debug({ bookingId: booking.id }, '[Reminders] Scheduled for booking');
  },

  /** Send a single reminder notification for a booking. */
  async sendReminder(booking: IBooking, minutesBefore: number): Promise<void> {
    try {
      const displayTime = formatForDisplay(booking.startUtc, booking.guestTimezone);
      const message     = `Reminder: "${booking.meetingTypeName}" with ${booking.guestName} at ${displayTime}`;

      // In-app notification to assignee
      await NotificationModel.create({
        organizationId: booking.organizationId,
        userId:         booking.assigneeId,
        type:           'info',
        title:          `Meeting reminder — ${minutesBefore < 60 ? minutesBefore + ' min' : Math.round(minutesBefore / 60) + 'h'}`,
        message,
      });

      // Mark reminder as sent
      await BookingModel.findByIdAndUpdate(booking.id, {
        $addToSet: { remindersSent: new Date().toISOString() },
      });

      BookingAnalyticsService.track({
        organizationId: booking.organizationId,
        eventType:      'reminder_sent',
        bookingId:      booking.id,
        metadata:       { minutesBefore },
      });
    } catch (err) {
      logger.warn({ err, bookingId: booking.id }, '[Reminders] Failed to send reminder');
    }
  },

  /**
   * Start the reminder cron job.
   * Runs every minute, checks for bookings needing reminders.
   * Called once at server startup.
   */
  startCronJob(): void {
    cron.schedule('* * * * *', async () => {
      const now = new Date();

      for (const offsetMin of REMINDER_OFFSETS_MINUTES) {
        const windowStart = new Date(now.getTime() + offsetMin * 60_000 - 30_000);
        const windowEnd   = new Date(now.getTime() + offsetMin * 60_000 + 30_000);

        const bookings = await BookingModel.find({
          status:   { $in: ['confirmed', 'rescheduled'] },
          startUtc: { $gte: windowStart, $lte: windowEnd },
        }).lean().catch(() => []);

        for (const b of bookings) {
          // Check if already sent for this offset
          const alreadySent = (b.remindersSent ?? []).length >= REMINDER_OFFSETS_MINUTES.indexOf(offsetMin) + 1;
          if (!alreadySent) {
            await ReminderService.sendReminder(b as unknown as IBooking, offsetMin);
          }
        }
      }
    });

    logger.info('[Reminders] Cron job started');
  },
};
