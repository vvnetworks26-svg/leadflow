/**
 * WorkflowExecution.model.ts
 *
 * Records every execution of a workflow.
 * Each execution contains a log of steps, timing, and outcome.
 * TTL: auto-deleted 90 days after completion.
 */

import { Schema, model, Document } from 'mongoose';
import type { ExecutionStatus, TriggerType } from '../automation/types';

export interface IExecutionStep {
  stepId:        string;
  stepName:      string;
  actionType:    string;
  status:        ExecutionStatus;
  startedAt:     Date;
  completedAt:   Date | null;
  durationMs:    number | null;
  input:         Record<string, unknown>;
  output:        Record<string, unknown>;
  error:         string | null;
  attempt:       number;
}

export interface IWorkflowExecution {
  id:             string;
  organizationId: string;
  workflowId:     string;
  workflowName:   string;
  version:        number;
  status:         ExecutionStatus;
  triggerType:    TriggerType;
  triggerData:    Record<string, unknown>;
  variables:      Record<string, unknown>;
  steps:          IExecutionStep[];
  startedAt:      Date;
  completedAt:    Date | null;
  durationMs:     number | null;
  error:          string | null;
  attempt:        number;
  nextRetryAt:    Date | null;
  resumeAt:       Date | null;           // for delayed workflows
  triggeredById:  string | null;         // userId for manual triggers
  createdAt:      Date;
}

export interface WorkflowExecutionDocument extends Omit<IWorkflowExecution, 'id'>, Document {}

const ExecutionStepSchema = new Schema(
  {
    stepId:      String, stepName: String, actionType: String,
    status:      String, startedAt: Date, completedAt: Date,
    durationMs:  Number, input: Schema.Types.Mixed, output: Schema.Types.Mixed,
    error:       String, attempt: { type: Number, default: 1 },
  },
  { _id: false }
);

const WorkflowExecutionSchema = new Schema<WorkflowExecutionDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    workflowId:     { type: String, required: true, index: true },
    workflowName:   { type: String, required: true },
    version:        { type: Number, default: 1 },
    status:         { type: String, enum: ['pending','running','completed','failed','cancelled','retrying','timeout','waiting'], default: 'pending' },
    triggerType:    { type: String, required: true },
    triggerData:    { type: Schema.Types.Mixed, default: {} },
    variables:      { type: Schema.Types.Mixed, default: {} },
    steps:          { type: [ExecutionStepSchema], default: [] },
    startedAt:      { type: Date, default: Date.now },
    completedAt:    { type: Date, default: null },
    durationMs:     { type: Number, default: null },
    error:          { type: String, default: null },
    attempt:        { type: Number, default: 1 },
    nextRetryAt:    { type: Date, default: null },
    resumeAt:       { type: Date, default: null },
    triggeredById:  { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

WorkflowExecutionSchema.index({ organizationId: 1, status: 1 });
WorkflowExecutionSchema.index({ organizationId: 1, workflowId: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ status: 1, nextRetryAt: 1 });   // for retry scheduler
WorkflowExecutionSchema.index({ status: 1, resumeAt: 1 });      // for delay scheduler
WorkflowExecutionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const WorkflowExecutionModel = model<WorkflowExecutionDocument>('WorkflowExecution', WorkflowExecutionSchema);
