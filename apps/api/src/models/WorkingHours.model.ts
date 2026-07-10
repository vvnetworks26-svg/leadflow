/**
 * WorkingHours.model.ts
 *
 * Per-user working hours for availability calculation.
 * Each user can have their own schedule, or inherit the org default.
 */

import { Schema, model, Document } from 'mongoose';

export interface IDayWindow {
  enabled:   boolean;
  startTime: string;   // 'HH:MM' in user's local timezone
  endTime:   string;   // 'HH:MM'
  breaks:    Array<{ startTime: string; endTime: string; label?: string }>;
}

export interface IWorkingHours {
  id:             string;
  organizationId: string;
  userId:         string;        // null = org-level default
  timezone:       string;        // IANA e.g. 'America/New_York'
  monday:         IDayWindow;
  tuesday:        IDayWindow;
  wednesday:      IDayWindow;
  thursday:       IDayWindow;
  friday:         IDayWindow;
  saturday:       IDayWindow;
  sunday:         IDayWindow;
  dateOverrides:  Array<{       // specific date overrides
    date:      string;           // YYYY-MM-DD
    enabled:   boolean;
    startTime: string;
    endTime:   string;
  }>;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface WorkingHoursDocument extends Omit<IWorkingHours, 'id'>, Document {}

const BreakSchema = new Schema(
  { startTime: String, endTime: String, label: String },
  { _id: false }
);

const DayWindowSchema = new Schema(
  {
    enabled:   { type: Boolean, default: false },
    startTime: { type: String,  default: '09:00' },
    endTime:   { type: String,  default: '17:00' },
    breaks:    { type: [BreakSchema], default: [] },
  },
  { _id: false }
);

const DEFAULT_WEEKDAY  = (): IDayWindow => ({ enabled: true,  startTime: '09:00', endTime: '17:00', breaks: [] });
const DEFAULT_WEEKEND  = (): IDayWindow => ({ enabled: false, startTime: '09:00', endTime: '17:00', breaks: [] });

const WorkingHoursSchema = new Schema<WorkingHoursDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    userId:         { type: String, required: true },
    timezone:       { type: String, default: 'America/New_York' },
    monday:         { type: DayWindowSchema, default: DEFAULT_WEEKDAY },
    tuesday:        { type: DayWindowSchema, default: DEFAULT_WEEKDAY },
    wednesday:      { type: DayWindowSchema, default: DEFAULT_WEEKDAY },
    thursday:       { type: DayWindowSchema, default: DEFAULT_WEEKDAY },
    friday:         { type: DayWindowSchema, default: DEFAULT_WEEKDAY },
    saturday:       { type: DayWindowSchema, default: DEFAULT_WEEKEND },
    sunday:         { type: DayWindowSchema, default: DEFAULT_WEEKEND },
    dateOverrides:  { type: Schema.Types.Mixed, default: [] },
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

WorkingHoursSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const WorkingHoursModel = model<WorkingHoursDocument>('WorkingHours', WorkingHoursSchema);
