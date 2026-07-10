/**
 * BookingAnalytics.model.ts — Scheduling analytics events.
 */
import { Schema, model, Document } from 'mongoose';

export type BookingEventType =
  | 'booking_created' | 'booking_confirmed' | 'booking_cancelled'
  | 'booking_rescheduled' | 'booking_completed' | 'booking_no_show'
  | 'reminder_sent' | 'availability_checked' | 'slot_suggested';

export interface IBookingAnalytics {
  organizationId: string;
  eventType:      BookingEventType;
  bookingId:      string | null;
  meetingTypeId:  string | null;
  assigneeId:     string | null;
  guestTimezone:  string | null;
  durationMinutes:number | null;
  leadTimeHours:  number | null;   // hours between booking and meeting
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface BookingAnalyticsDocument extends IBookingAnalytics, Document {}

const BookingAnalyticsSchema = new Schema<BookingAnalyticsDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    eventType:      { type: String, required: true, index: true },
    bookingId:      { type: String, default: null },
    meetingTypeId:  { type: String, default: null },
    assigneeId:     { type: String, default: null },
    guestTimezone:  { type: String, default: null },
    durationMinutes:{ type: Number, default: null },
    leadTimeHours:  { type: Number, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

BookingAnalyticsSchema.index({ organizationId: 1, createdAt: -1 });
BookingAnalyticsSchema.index({ organizationId: 1, eventType: 1 });

export const BookingAnalyticsModel = model<BookingAnalyticsDocument>('BookingAnalytics', BookingAnalyticsSchema);
