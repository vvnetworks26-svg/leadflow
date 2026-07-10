/**
 * WidgetDeployment.model.ts — Widget deployment records with versioning.
 */

import { Schema, model, Document } from 'mongoose';

export type DeploymentStatus = 'draft' | 'published' | 'archived';
export type DeploymentPlatform = 'html' | 'react' | 'nextjs' | 'vue' | 'angular' | 'wordpress' | 'shopify' | 'webflow' | 'wix' | 'squarespace' | 'javascript';

export interface IWidgetDeployment {
  id:              string;
  organizationId:  string;
  name:            string;
  status:          DeploymentStatus;
  version:         number;
  configSnapshot:  Record<string, unknown>;   // frozen copy of config at publish time
  publishedAt:     Date | null;
  publishedById:   string | null;
  archivedAt:      Date | null;
  changeNotes:     string;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface WidgetDeploymentDocument extends Omit<IWidgetDeployment, 'id'>, Document {}

const WidgetDeploymentSchema = new Schema<WidgetDeploymentDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true },
    status:         { type: String, enum: ['draft','published','archived'], default: 'draft' },
    version:        { type: Number, required: true },
    configSnapshot: { type: Schema.Types.Mixed, default: {} },
    publishedAt:    { type: Date, default: null },
    publishedById:  { type: String, default: null },
    archivedAt:     { type: Date, default: null },
    changeNotes:    { type: String, default: '' },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

WidgetDeploymentSchema.index({ organizationId: 1, status: 1 });
WidgetDeploymentSchema.index({ organizationId: 1, version: -1 });

export const WidgetDeploymentModel = model<WidgetDeploymentDocument>('WidgetDeployment', WidgetDeploymentSchema);
