/**
 * CommunicationTemplate.model.ts — Reusable message templates with versioning.
 */

import { Schema, model, Document } from 'mongoose';
import type { ThreadChannel } from './ConversationThread.model';

export interface ITemplateVersion {
  version: number;
  subject: string;
  body:    string;
  bodyHtml:string;
  savedAt: Date;
}

export interface ICommunicationTemplate {
  id:             string;
  organizationId: string;
  name:           string;
  category:       string;
  channel:        ThreadChannel;
  subject:        string;
  body:           string;
  bodyHtml:       string;
  variables:      string[];    // {{variable}} names found in body
  isActive:       boolean;
  currentVersion: number;
  versionHistory: ITemplateVersion[];
  usageCount:     number;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface CommunicationTemplateDocument extends Omit<ICommunicationTemplate, 'id'>, Document {}

const CommunicationTemplateSchema = new Schema<CommunicationTemplateDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    category:       { type: String, default: 'General' },
    channel:        { type: String, required: true },
    subject:        { type: String, default: '' },
    body:           { type: String, default: '' },
    bodyHtml:       { type: String, default: '' },
    variables:      { type: [String], default: [] },
    isActive:       { type: Boolean, default: true },
    currentVersion: { type: Number, default: 1 },
    versionHistory: { type: Schema.Types.Mixed, default: [] },
    usageCount:     { type: Number, default: 0 },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

CommunicationTemplateSchema.index({ organizationId: 1, channel: 1 });
CommunicationTemplateSchema.index({ organizationId: 1, category: 1 });

export const CommunicationTemplateModel = model<CommunicationTemplateDocument>('CommunicationTemplate', CommunicationTemplateSchema);
