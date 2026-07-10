/**
 * Holiday.model.ts
 *
 * Organization-scoped business holidays that block all availability.
 */

import { Schema, model, Document } from 'mongoose';

export interface IHoliday {
  id:             string;
  organizationId: string;
  name:           string;
  date:           string;       // YYYY-MM-DD
  recurring:      boolean;      // true = repeats every year on same month/day
  createdAt:      Date;
}

export interface HolidayDocument extends Omit<IHoliday, 'id'>, Document {}

const HolidaySchema = new Schema<HolidayDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    date:           { type: String, required: true },
    recurring:      { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

HolidaySchema.index({ organizationId: 1, date: 1 });

export const HolidayModel = model<HolidayDocument>('Holiday', HolidaySchema);
