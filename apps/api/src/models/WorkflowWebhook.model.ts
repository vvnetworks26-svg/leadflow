/**
 * WorkflowWebhook.model.ts — Incoming webhook endpoints per workflow.
 */

import { Schema, model, Document } from 'mongoose';

export interface IWorkflowWebhook {
  id:             string;
  organizationId: string;
  workflowId:     string;
  name:           string;
  token:          string;          // secret for HMAC-SHA256 signature verification
  endpoint:       string;          // generated URL slug
  isActive:       boolean;
  hitCount:       number;
  lastHitAt:      Date | null;
  createdAt:      Date;
}

export interface WorkflowWebhookDocument extends Omit<IWorkflowWebhook, 'id'>, Document {}

const WorkflowWebhookSchema = new Schema<WorkflowWebhookDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    workflowId:     { type: String, required: true },
    name:           { type: String, required: true },
    token:          { type: String, required: true, select: false },
    endpoint:       { type: String, required: true, unique: true },
    isActive:       { type: Boolean, default: true },
    hitCount:       { type: Number, default: 0 },
    lastHitAt:      { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).token;
        return ret;
      },
    },
  }
);

export const WorkflowWebhookModel = model<WorkflowWebhookDocument>('WorkflowWebhook', WorkflowWebhookSchema);
