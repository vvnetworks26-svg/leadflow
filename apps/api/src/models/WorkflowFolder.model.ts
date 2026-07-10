/**
 * WorkflowFolder.model.ts — Organizes workflows into folders per org.
 */

import { Schema, model, Document } from 'mongoose';

export interface IWorkflowFolder {
  id:             string;
  organizationId: string;
  name:           string;
  color:          string;
  parentId:       string | null;
  createdAt:      Date;
}

export interface WorkflowFolderDocument extends Omit<IWorkflowFolder, 'id'>, Document {}

const WorkflowFolderSchema = new Schema<WorkflowFolderDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    color:          { type: String, default: '#6366f1' },
    parentId:       { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const WorkflowFolderModel = model<WorkflowFolderDocument>('WorkflowFolder', WorkflowFolderSchema);
