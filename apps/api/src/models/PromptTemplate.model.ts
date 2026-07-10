/**
 * PromptTemplate.model.ts — Versioned prompt templates for agents.
 */

import { Schema, model, Document } from 'mongoose';

export type PromptType = 'system' | 'agent' | 'organization' | 'tool' | 'reflection' | 'evaluation' | 'custom';

export interface IPromptVersion {
  version: number;
  content: string;
  variables: string[];
  savedAt: Date;
  savedById: string;
}

export interface IPromptTemplate {
  id:             string;
  organizationId: string;
  agentId:        string | null;
  name:           string;
  type:           PromptType;
  content:        string;
  variables:      string[];
  currentVersion: number;
  versionHistory: IPromptVersion[];
  isActive:       boolean;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface PromptTemplateDocument extends Omit<IPromptTemplate, 'id'>, Document {}

const PromptTemplateSchema = new Schema<PromptTemplateDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    agentId:        { type: String, default: null },
    name:           { type: String, required: true },
    type:           { type: String, enum: ['system','agent','organization','tool','reflection','evaluation','custom'], default: 'agent' },
    content:        { type: String, required: true },
    variables:      { type: [String], default: [] },
    currentVersion: { type: Number, default: 1 },
    versionHistory: { type: Schema.Types.Mixed, default: [] },
    isActive:       { type: Boolean, default: true },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

PromptTemplateSchema.index({ organizationId: 1, type: 1 });
PromptTemplateSchema.index({ organizationId: 1, agentId: 1 });

export const PromptTemplateModel = model<PromptTemplateDocument>('PromptTemplate', PromptTemplateSchema);
