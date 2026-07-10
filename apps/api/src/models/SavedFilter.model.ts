/**
 * SavedFilter.model.ts
 *
 * User-saved CRM filter presets.
 * Filters are per-user within an organization.
 */

import { Schema, model, Document } from 'mongoose';

export interface ISavedFilter {
  id:             string;
  organizationId: string;
  userId:         string;
  name:           string;
  entity:         'lead' | 'contact' | 'company' | 'task';
  filters:        Record<string, unknown>;
  createdAt:      Date;
}

export interface SavedFilterDocument extends Omit<ISavedFilter, 'id'>, Document {}

const SavedFilterSchema = new Schema<SavedFilterDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    userId:         { type: String, required: true },
    name:           { type: String, required: true, trim: true },
    entity:         { type: String, enum: ['lead','contact','company','task'], required: true },
    filters:        { type: Schema.Types.Mixed, default: {} },
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

SavedFilterSchema.index({ organizationId: 1, userId: 1, entity: 1 });

export const SavedFilterModel = model<SavedFilterDocument>('SavedFilter', SavedFilterSchema);
