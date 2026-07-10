/**
 * TagService.ts — Custom tags with usage tracking and auto-suggestions.
 */

import { TagModel, ITag } from '../../models/Tag.model';
import { ApiError } from '../../middleware/errorHandler';

export const TagService = {

  async list(organizationId: string): Promise<ITag[]> {
    const docs = await TagModel.find({ organizationId }).sort({ usageCount: -1 });
    return docs.map(d => d.toJSON() as unknown as ITag);
  },

  async suggest(organizationId: string, query: string, limit = 8): Promise<ITag[]> {
    const re   = new RegExp(query, 'i');
    const docs = await TagModel.find({ organizationId, name: re })
      .sort({ usageCount: -1 })
      .limit(limit);
    return docs.map(d => d.toJSON() as unknown as ITag);
  },

  async getOrCreate(organizationId: string, name: string, color = '#6366f1'): Promise<ITag> {
    const normalized = name.toLowerCase().trim();
    const doc = await TagModel.findOneAndUpdate(
      { organizationId, name: normalized },
      { $setOnInsert: { organizationId, name: normalized, color, description: '' } },
      { upsert: true, new: true }
    );
    return doc.toJSON() as unknown as ITag;
  },

  async create(organizationId: string, data: { name: string; color?: string; description?: string }): Promise<ITag> {
    const doc = await TagModel.create({
      organizationId,
      name:        data.name.toLowerCase().trim(),
      color:       data.color ?? '#6366f1',
      description: data.description ?? '',
    });
    return doc.toJSON() as unknown as ITag;
  },

  async update(organizationId: string, id: string, patch: Partial<Pick<ITag, 'color' | 'description'>>): Promise<ITag> {
    const doc = await TagModel.findOneAndUpdate(
      { _id: id, organizationId }, patch, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Tag not found', 'TAG_NOT_FOUND');
    return doc.toJSON() as unknown as ITag;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await TagModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Tag not found', 'TAG_NOT_FOUND');
  },

  /** Increment usage count for a tag name. */
  async incrementUsage(organizationId: string, tagName: string): Promise<void> {
    await TagModel.findOneAndUpdate(
      { organizationId, name: tagName.toLowerCase() },
      { $inc: { usageCount: 1 } }
    );
  },

  /** Decrement usage count when a tag is removed from a record. */
  async decrementUsage(organizationId: string, tagName: string): Promise<void> {
    await TagModel.findOneAndUpdate(
      { organizationId, name: tagName.toLowerCase(), usageCount: { $gt: 0 } },
      { $inc: { usageCount: -1 } }
    );
  },
};
