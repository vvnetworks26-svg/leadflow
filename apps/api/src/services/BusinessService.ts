/**
 * BusinessService.ts
 *
 * Manages organization-level business configuration (hours, services, AI, team, etc.)
 * Every query is scoped to an organizationId — no global queries exist.
 */

import { BusinessModel } from '../models/Business.model';
import { ApiError } from '../middleware/errorHandler';
import { BusinessSettings } from '../types';

export const BusinessService = {
  /** Get business settings for a specific organization. Returns null if not yet configured. */
  async get(organizationId: string): Promise<BusinessSettings | null> {
    const doc = await BusinessModel.findOne({ organizationId });
    if (!doc) return null;
    const obj = doc.toJSON() as any;
    delete obj.id;
    delete obj.organizationId;
    delete obj.createdAt;
    delete obj.updatedAt;
    return obj as BusinessSettings;
  },

  /** Create or update business settings for an organization. */
  async upsert(organizationId: string, settings: Partial<BusinessSettings>): Promise<BusinessSettings> {
    const doc = await BusinessModel.findOneAndUpdate(
      { organizationId },
      { $set: { ...settings, organizationId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    const obj = doc!.toJSON() as any;
    delete obj.id;
    delete obj.organizationId;
    delete obj.createdAt;
    delete obj.updatedAt;
    return obj as BusinessSettings;
  },
};
