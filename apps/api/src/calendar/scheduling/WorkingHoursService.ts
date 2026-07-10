/**
 * WorkingHoursService.ts — CRUD for per-user working hours.
 */

import { WorkingHoursModel, IWorkingHours } from '../../models/WorkingHours.model';
import { ApiError } from '../../middleware/errorHandler';

export const WorkingHoursService = {

  async get(organizationId: string, userId: string): Promise<IWorkingHours | null> {
    const doc = await WorkingHoursModel.findOne({ organizationId, userId });
    return doc ? (doc.toJSON() as unknown as IWorkingHours) : null;
  },

  async upsert(organizationId: string, userId: string, data: Partial<IWorkingHours>): Promise<IWorkingHours> {
    const doc = await WorkingHoursModel.findOneAndUpdate(
      { organizationId, userId },
      { $set: { ...data, organizationId, userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc!.toJSON() as unknown as IWorkingHours;
  },

  /** Seed default working hours for a new user in an organization. */
  async seedDefaults(organizationId: string, userId: string, timezone = 'America/New_York'): Promise<IWorkingHours> {
    const existing = await WorkingHoursModel.findOne({ organizationId, userId });
    if (existing) return existing.toJSON() as unknown as IWorkingHours;

    const doc = await WorkingHoursModel.create({
      organizationId, userId, timezone,
    });
    return doc.toJSON() as unknown as IWorkingHours;
  },
};
