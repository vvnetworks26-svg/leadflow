/**
 * WorkflowTemplate.model.ts — Seeded default workflow templates.
 * Templates are org-independent (organizationId = null means global/system).
 */

import { Schema, model, Document } from 'mongoose';
import type { TriggerConfig, WorkflowStep } from '../automation/types';

export interface IWorkflowTemplate {
  id:          string;
  name:        string;
  description: string;
  category:    string;
  trigger:     TriggerConfig;
  steps:       WorkflowStep[];
  tags:        string[];
  isSystem:    boolean;    // true = shipped with LeadFlow
  usageCount:  number;
  createdAt:   Date;
}

export interface WorkflowTemplateDocument extends Omit<IWorkflowTemplate, 'id'>, Document {}

const WorkflowTemplateSchema = new Schema<WorkflowTemplateDocument>(
  {
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    category:    { type: String, default: 'General', index: true },
    trigger:     { type: Schema.Types.Mixed, required: true },
    steps:       { type: Schema.Types.Mixed, default: [] },
    tags:        { type: [String], default: [] },
    isSystem:    { type: Boolean, default: false },
    usageCount:  { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const WorkflowTemplateModel = model<WorkflowTemplateDocument>('WorkflowTemplate', WorkflowTemplateSchema);
