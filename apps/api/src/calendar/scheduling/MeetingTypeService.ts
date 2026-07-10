/**
 * MeetingTypeService.ts — CRUD for meeting types + seeding defaults.
 */

import { MeetingTypeModel, IMeetingType } from '../../models/MeetingType.model';
import { ApiError }                       from '../../middleware/errorHandler';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const MeetingTypeService = {

  async list(organizationId: string): Promise<IMeetingType[]> {
    const docs = await MeetingTypeModel.find({ organizationId }).sort({ name: 1 });
    return docs.map(d => d.toJSON() as unknown as IMeetingType);
  },

  async getById(organizationId: string, id: string): Promise<IMeetingType> {
    const doc = await MeetingTypeModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
    return doc.toJSON() as unknown as IMeetingType;
  },

  async getBySlug(organizationId: string, slug: string): Promise<IMeetingType> {
    const doc = await MeetingTypeModel.findOne({ organizationId, slug, isActive: true });
    if (!doc) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
    return doc.toJSON() as unknown as IMeetingType;
  },

  async create(organizationId: string, data: Partial<IMeetingType>): Promise<IMeetingType> {
    const slug = toSlug(data.name ?? 'meeting');
    const doc  = await MeetingTypeModel.create({ ...data, organizationId, slug });
    return doc.toJSON() as unknown as IMeetingType;
  },

  async update(organizationId: string, id: string, data: Partial<IMeetingType>): Promise<IMeetingType> {
    const patch = { ...data };
    if (data.name) patch.slug = toSlug(data.name);
    const doc = await MeetingTypeModel.findOneAndUpdate(
      { _id: id, organizationId }, patch, { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
    return doc.toJSON() as unknown as IMeetingType;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await MeetingTypeModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
  },

  async toggle(organizationId: string, id: string, isActive: boolean): Promise<IMeetingType> {
    const doc = await MeetingTypeModel.findOneAndUpdate(
      { _id: id, organizationId }, { isActive }, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Meeting type not found', 'MEETING_TYPE_NOT_FOUND');
    return doc.toJSON() as unknown as IMeetingType;
  },

  /** Seed default meeting types for a new organization. */
  async seedDefaults(organizationId: string): Promise<void> {
    const existing = await MeetingTypeModel.countDocuments({ organizationId });
    if (existing > 0) return;

    const defaults = [
      { name: 'Discovery Call',    durationMinutes: 30,  color: '#6366f1', location: 'video',    description: 'Initial discovery call to understand your needs' },
      { name: 'Demo',              durationMinutes: 45,  color: '#22c55e', location: 'video',    description: 'Product demo and walkthrough' },
      { name: 'Sales Call',        durationMinutes: 60,  color: '#f59e0b', location: 'video',    description: 'In-depth sales consultation' },
      { name: 'Support Call',      durationMinutes: 30,  color: '#3b82f6', location: 'video',    description: 'Technical support session' },
      { name: 'Consultation',      durationMinutes: 60,  color: '#8b5cf6', location: 'video',    description: 'Expert consultation session' },
      { name: 'Site Visit',        durationMinutes: 120, color: '#f97316', location: 'in_person',description: 'On-site visit and assessment' },
    ];

    for (const d of defaults) {
      await MeetingTypeModel.create({
        ...d,
        slug:           toSlug(d.name),
        organizationId,
        isActive:       true,
        bufferRules:    { before: 0, after: 15, travel: 0, cleanup: 0 },
        routingRules:   { strategy: 'round_robin', assigneeIds: [] },
        maxAdvanceDays: 60,
        minNoticeHours: 1,
      });
    }
  },
};
