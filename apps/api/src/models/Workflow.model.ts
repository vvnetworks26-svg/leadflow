/**
 * Workflow.model.ts
 *
 * A workflow definition owned by an organization.
 * Workflows are versioned — each save creates a WorkflowVersion snapshot.
 * Execution always runs against a specific version.
 */

import { Schema, model, Document } from 'mongoose';
import type { TriggerConfig, WorkflowStep, WorkflowVariable } from '../automation/types';

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface IWorkflow {
  id:               string;
  organizationId:   string;
  folderId:         string | null;
  name:             string;
  description:      string;
  status:           WorkflowStatus;
  trigger:          TriggerConfig;
  steps:            WorkflowStep[];
  variables:        WorkflowVariable[];
  currentVersion:   number;
  tags:             string[];
  createdById:      string;
  updatedById:      string;
  lastRunAt:        Date | null;
  runCount:         number;
  successCount:     number;
  failureCount:     number;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface WorkflowDocument extends Omit<IWorkflow, 'id'>, Document {}

const WorkflowSchema = new Schema<WorkflowDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    folderId:       { type: String, default: null },
    name:           { type: String, required: true, trim: true },
    description:    { type: String, default: '' },
    status:         { type: String, enum: ['draft','active','paused','archived'], default: 'draft' },
    trigger:        { type: Schema.Types.Mixed, required: true },
    steps:          { type: Schema.Types.Mixed, default: [] },
    variables:      { type: Schema.Types.Mixed, default: [] },
    currentVersion: { type: Number, default: 1 },
    tags:           { type: [String], default: [] },
    createdById:    { type: String, required: true },
    updatedById:    { type: String, required: true },
    lastRunAt:      { type: Date, default: null },
    runCount:       { type: Number, default: 0 },
    successCount:   { type: Number, default: 0 },
    failureCount:   { type: Number, default: 0 },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

WorkflowSchema.index({ organizationId: 1, status: 1 });
WorkflowSchema.index({ organizationId: 1, 'trigger.type': 1, status: 1 });
WorkflowSchema.index({ organizationId: 1, createdAt: -1 });

export const WorkflowModel = model<WorkflowDocument>('Workflow', WorkflowSchema);
