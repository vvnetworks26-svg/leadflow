/**
 * SchedulingPolicy.model.ts — Org-level booking rules and constraints.
 */
import { Schema, model, Document } from 'mongoose';

export interface ISchedulingPolicy {
  id:                   string;
  organizationId:       string;
  maxBookingsPerDay:    number | null;    // per assignee
  maxBookingsPerWeek:   number | null;
  allowWeekendBookings: boolean;
  requireConfirmation:  boolean;          // pending → manual confirm
  blockHolidays:        boolean;
  futureLimitDays:      number;           // max days ahead (default 90)
  pastBookingBuffer:    number;           // min hours before slot (default 2)
  defaultBufferBefore:  number;           // org-wide default buffer minutes
  defaultBufferAfter:   number;
  defaultTimezone:      string;
  createdAt:            Date;
  updatedAt:            Date;
}

export interface SchedulingPolicyDocument extends Omit<ISchedulingPolicy, 'id'>, Document {}

const SchedulingPolicySchema = new Schema<SchedulingPolicyDocument>(
  {
    organizationId:       { type: String, required: true, unique: true },
    maxBookingsPerDay:    { type: Number, default: null },
    maxBookingsPerWeek:   { type: Number, default: null },
    allowWeekendBookings: { type: Boolean, default: false },
    requireConfirmation:  { type: Boolean, default: false },
    blockHolidays:        { type: Boolean, default: true },
    futureLimitDays:      { type: Number, default: 90 },
    pastBookingBuffer:    { type: Number, default: 2 },
    defaultBufferBefore:  { type: Number, default: 0 },
    defaultBufferAfter:   { type: Number, default: 15 },
    defaultTimezone:      { type: String, default: 'America/New_York' },
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

export const SchedulingPolicyModel = model<SchedulingPolicyDocument>('SchedulingPolicy', SchedulingPolicySchema);
