/**
 * Tag.model.ts
 *
 * Organization-scoped tags for leads, contacts, and companies.
 * Usage count is maintained for auto-suggestions.
 */

import { Schema, model, Document } from 'mongoose';

export interface ITag {
  id:             string;
  organizationId: string;
  name:           string;
  color:          string;   // hex
  description:    string;
  usageCount:     number;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface TagDocument extends Omit<ITag, 'id'>, Document {}

const TagSchema = new Schema<TagDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true, lowercase: true },
    color:          { type: String, default: '#6366f1' },
    description:    { type: String, default: '' },
    usageCount:     { type: Number, default: 0 },
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

// Unique tag name per organization
TagSchema.index({ organizationId: 1, name: 1 }, { unique: true });
TagSchema.index({ organizationId: 1, usageCount: -1 });

export const TagModel = model<TagDocument>('Tag', TagSchema);
