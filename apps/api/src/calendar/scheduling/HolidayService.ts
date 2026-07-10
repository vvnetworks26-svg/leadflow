/**
 * HolidayService.ts — CRUD for org holidays.
 */

import { HolidayModel, IHoliday } from '../../models/Holiday.model';
import { ApiError } from '../../middleware/errorHandler';

export const HolidayService = {

  async list(organizationId: string): Promise<IHoliday[]> {
    const docs = await HolidayModel.find({ organizationId }).sort({ date: 1 });
    return docs.map(d => d.toJSON() as unknown as IHoliday);
  },

  async create(organizationId: string, data: { name: string; date: string; recurring?: boolean }): Promise<IHoliday> {
    const doc = await HolidayModel.create({ ...data, organizationId });
    return doc.toJSON() as unknown as IHoliday;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await HolidayModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Holiday not found', 'HOLIDAY_NOT_FOUND');
  },

  /** Seed common US federal holidays for a new organization. */
  async seedDefaults(organizationId: string): Promise<void> {
    const existing = await HolidayModel.countDocuments({ organizationId });
    if (existing > 0) return;

    const year     = new Date().getFullYear();
    const holidays = [
      { name: "New Year's Day",         date: `${year}-01-01`, recurring: true },
      { name: 'Independence Day',       date: `${year}-07-04`, recurring: true },
      { name: 'Thanksgiving Day',       date: `${year}-11-28`, recurring: false },
      { name: 'Christmas Day',          date: `${year}-12-25`, recurring: true },
      { name: 'Memorial Day',           date: `${year}-05-27`, recurring: false },
      { name: 'Labor Day',              date: `${year}-09-02`, recurring: false },
    ];

    await HolidayModel.insertMany(holidays.map(h => ({ ...h, organizationId })));
  },
};
