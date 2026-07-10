/**
 * WidgetAsset.model.ts — Uploaded branding assets (logos, avatars, fonts, backgrounds).
 */

import { Schema, model, Document } from 'mongoose';

export type AssetType = 'logo' | 'avatar' | 'icon' | 'background' | 'font' | 'favicon';

export interface IWidgetAsset {
  id:             string;
  organizationId: string;
  type:           AssetType;
  name:           string;
  url:            string;           // CDN or storage URL
  mimeType:       string;
  sizeBytes:      number;
  width:          number | null;
  height:         number | null;
  uploadedById:   string;
  createdAt:      Date;
}

export interface WidgetAssetDocument extends Omit<IWidgetAsset, 'id'>, Document {}

const WidgetAssetSchema = new Schema<WidgetAssetDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    type:           { type: String, enum: ['logo','avatar','icon','background','font','favicon'], required: true },
    name:           { type: String, required: true },
    url:            { type: String, required: true },
    mimeType:       { type: String, required: true },
    sizeBytes:      { type: Number, default: 0 },
    width:          { type: Number, default: null },
    height:         { type: Number, default: null },
    uploadedById:   { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

WidgetAssetSchema.index({ organizationId: 1, type: 1 });

export const WidgetAssetModel = model<WidgetAssetDocument>('WidgetAsset', WidgetAssetSchema);
