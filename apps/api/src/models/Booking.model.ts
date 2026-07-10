/**
 * Booking.model.ts
 *
 * A scheduled meeting/booking record.
 * Links to: MeetingType, CalendarConnection, Lead, Appointment.
 * Tracks all lifecycle events: confirmed → rescheduled → cancelled → completed.
 */

import { Schema, model, Document } from 'mongoose';

export type BookingStatus = 'pending' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';

export interface IBooking {
  id:               string;
  organizationId:   string;
  meetingTypeId:    string;
  meetingTypeName:  string;
  assigneeId:       string;          // who is hosting
  guestName:        string;
  guestEmail:       string;
  guestPhone:       string;
  guestTimezone:    string;
  startUtc:         Date;
  endUtc:           Date;
  durationMinutes:  number;
  status:           BookingStatus;
  location:         string;
  videoLink:        string;
  notes:            string;
  leadId:           string | null;
  appointmentId:    string | null;
  externalEventId:  string | null;   // calendar provider's event ID
  externalProvider: string | null;
  confirmationCode: string;
  cancellationReason: string | null;
  remindersSent:    string[];        // ISO timestamps
  rescheduleHistory: Array<{
    from:         Date;
    to:           Date;
    reason:       string;
    changedAt:    Date;
    changedById:  string;
  }>;
  customFieldValues: Record<string, unknown>;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface BookingDocument extends Omit<IBooking, 'id'>, Document {}

const RescheduleHistorySchema = new Schema(
  { from: Date, to: Date, reason: String, changedAt: Date, changedById: String },
  { _id: false }
);

const BookingSchema = new Schema<BookingDocument>(
  {
    organizationId:    { type: String, required: true, index: true },
    meetingTypeId:     { type: String, required: true },
    meetingTypeName:   { type: String, required: true },
    assigneeId:        { type: String, required: true, index: true },
    guestName:         { type: String, required: true },
    guestEmail:        { type: String, required: true, lowercase: true },
    guestPhone:        { type: String, default: '' },
    guestTimezone:     { type: String, default: 'UTC' },
    startUtc:          { type: Date,   required: true, index: true },
    endUtc:            { type: Date,   required: true },
    durationMinutes:   { type: Number, required: true },
    status:            { type: String, enum: ['pending','confirmed','rescheduled','cancelled','completed','no_show'], default: 'confirmed' },
    location:          { type: String, default: '' },
    videoLink:         { type: String, default: '' },
    notes:             { type: String, default: '' },
    leadId:            { type: String, default: null },
    appointmentId:     { type: String, default: null },
    externalEventId:   { type: String, default: null },
    externalProvider:  { type: String, default: null },
    confirmationCode:  { type: String, required: true },
    cancellationReason:{ type: String, default: null },
    remindersSent:     { type: [String], default: [] },
    rescheduleHistory: { type: [RescheduleHistorySchema], default: [] },
    customFieldValues: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

BookingSchema.index({ organizationId: 1, startUtc: 1 });
BookingSchema.index({ organizationId: 1, status: 1 });
BookingSchema.index({ organizationId: 1, assigneeId: 1, startUtc: 1 });
BookingSchema.index({ organizationId: 1, guestEmail: 1 });
BookingSchema.index({ confirmationCode: 1 }, { unique: true });

export const BookingModel = model<BookingDocument>('Booking', BookingSchema);
