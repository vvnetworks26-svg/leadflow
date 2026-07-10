/**
 * SavedView.model.ts — User-saved dashboard filter presets.
 */

import { Schema, model, Document } from 'mongoose';

export interface ISavedView {
  id:             string;
  organizationId: string;
  userId:         string;
  name:           string;
  dashboardSection: string;
  filters:        Record<string, unknown>;
  isDefault:      boolean;
  createdAt:      Date;
}

export interface SavedViewDocument extends Omit<ISavedView, 'id'>, Document {}

const SavedViewSchema = new Schema<SavedViewDocument>(
  {
    organizationId:  { type: String, required: true, index: true },
    userId:          { type: String, required: true },
    name:            { type: String, required: true, trim: true },
    dashboardSection:{ type: String, required: true },
    filters:         { type: Schema.Types.Mixed, default: {} },
    isDefault:       { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

SavedViewSchema.index({ organizationId: 1, userId: 1, dashboardSection: 1 });

export const SavedViewModel = model<SavedViewDocument>('SavedView', SavedViewSchema);
