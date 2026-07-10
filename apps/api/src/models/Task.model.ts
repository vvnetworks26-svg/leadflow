/**
 * Task.model.ts
 *
 * CRM task linked to a lead, contact, or company.
 * Supports reminders, priorities, recurrence, and completion tracking.
 */

import { Schema, model, Document } from 'mongoose';

export type TaskType = 'Call' | 'Email' | 'Meeting' | 'Follow-up' | 'Proposal' | 'Custom' | 'Support';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ITask {
  id:             string;
  organizationId: string;
  type:           TaskType;
  title:          string;
  description:    string;
  leadId:         string | null;
  contactId:      string | null;
  companyId:      string | null;
  ownerId:        string | null;   // assigned user
  priority:       TaskPriority;
  dueDate:        Date | null;
  reminderAt:     Date | null;
  completed:      boolean;
  completedAt:    Date | null;
  completedById:  string | null;
  recurrence:     RecurrenceType;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface TaskDocument extends Omit<ITask, 'id'>, Document {}

const TaskSchema = new Schema<TaskDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    type:           { type: String, enum: ['Call','Email','Meeting','Follow-up','Proposal','Custom','Support'], default: 'Follow-up' },
    title:          { type: String, required: true, trim: true },
    description:    { type: String, default: '' },
    leadId:         { type: String, default: null, index: true },
    contactId:      { type: String, default: null },
    companyId:      { type: String, default: null },
    ownerId:        { type: String, default: null, index: true },
    priority:       { type: String, enum: ['Low','Medium','High','Urgent'], default: 'Medium' },
    dueDate:        { type: Date, default: null },
    reminderAt:     { type: Date, default: null },
    completed:      { type: Boolean, default: false },
    completedAt:    { type: Date, default: null },
    completedById:  { type: String, default: null },
    recurrence:     { type: String, enum: ['none','daily','weekly','monthly'], default: 'none' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

TaskSchema.index({ organizationId: 1, completed: 1, dueDate: 1 });
TaskSchema.index({ organizationId: 1, ownerId: 1, completed: 1 });
TaskSchema.index({ organizationId: 1, leadId: 1 });

export const TaskModel = model<TaskDocument>('Task', TaskSchema);
