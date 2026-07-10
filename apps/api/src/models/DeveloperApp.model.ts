/**
 * DeveloperApp.model.ts — Third-party developer application registrations.
 */

import { Schema, model, Document } from 'mongoose';

export interface IDeveloperApp {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string;
  clientId:       string;
  clientSecret:   string;   // select: false
  redirectUris:   string[];
  scopes:         string[];
  webhookUrl:     string;
  isActive:       boolean;
  isSandbox:      boolean;
  usageCount:     number;
  lastUsedAt:     Date | null;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface DeveloperAppDocument extends Omit<IDeveloperApp, 'id'>, Document {}

const DeveloperAppSchema = new Schema<DeveloperAppDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true },
    description:    { type: String, default: '' },
    clientId:       { type: String, required: true, unique: true },
    clientSecret:   { type: String, required: true, select: false },
    redirectUris:   { type: [String], default: [] },
    scopes:         { type: [String], default: [] },
    webhookUrl:     { type: String, default: '' },
    isActive:       { type: Boolean, default: true },
    isSandbox:      { type: Boolean, default: false },
    usageCount:     { type: Number, default: 0 },
    lastUsedAt:     { type: Date, default: null },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; delete (ret as any).clientSecret; return ret; } },
  }
);

export const DeveloperAppModel = model<DeveloperAppDocument>('DeveloperApp', DeveloperAppSchema);
