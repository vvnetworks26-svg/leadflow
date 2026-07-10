/**
 * Activity.model.ts
 *
 * Immutable activity timeline event.
 * Every interaction with a lead/contact/company generates an activity.
 * Activities are never edited — they form an audit trail.
 */

import { Schema, model, Document } from 'mongoose';

export type ActivityType =
  | 'lead_created'
  | 'ai_conversation'
  | 'booking'
  | 'call'
  | 'email'
  | 'sms'
  | 'task_completed'
  | 'stage_changed'
  | 'quote_sent'
  | 'invoice_paid'
  | 'note_added'
  | 'contact_added'
  | 'company_linked'
  | 'tag_added'
  | 'owner_changed'
  | 'field_updated'
  | 'duplicate_merged'
  | 'automation_triggered'
  | 'custom';

export interface IActivity {
  id:             string;
  organizationId: string;
  type:           ActivityType;
  leadId:         string | null;
  contactId:      string | null;
  companyId:      string | null;
  userId:         string | null;   // who performed it (null = system/AI)
  title:          string;
  description:    string;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface ActivityDocument extends Omit<IActivity, 'id'>, Document {}

const ActivitySchema = new Schema<ActivityDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    type:           { type: String, required: true, index: true },
    leadId:         { type: String, default: null, index: true },
    contactId:      { type: String, default: null },
    companyId:      { type: String, default: null },
    userId:         { type: String, default: null },
    title:          { type: String, required: true },
    description:    { type: String, default: '' },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

ActivitySchema.index({ organizationId: 1, createdAt: -1 });
ActivitySchema.index({ organizationId: 1, leadId: 1, createdAt: -1 });
ActivitySchema.index({ organizationId: 1, type: 1, createdAt: -1 });

export const ActivityModel = model<ActivityDocument>('Activity', ActivitySchema);
