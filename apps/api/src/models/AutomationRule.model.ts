/**
 * AutomationRule.model.ts
 *
 * Organization-scoped automation rules.
 * Trigger: an event (lead_created, stage_changed, etc.)
 * Conditions: optional filter criteria
 * Actions: what to do (assign_owner, create_task, notify_team, etc.)
 */

import { Schema, model, Document } from 'mongoose';

export type AutomationTrigger =
  | 'lead_created'
  | 'stage_changed'
  | 'booking_made'
  | 'lead_lost'
  | 'lead_won'
  | 'invoice_paid'
  | 'task_overdue'
  | 'tag_added'
  | 'score_threshold';

export type AutomationActionType =
  | 'assign_owner'
  | 'create_task'
  | 'send_notification'
  | 'notify_team'
  | 'update_score'
  | 'move_stage'
  | 'add_tag'
  | 'remove_tag'
  | 'send_email';

export interface AutomationAction {
  type:   AutomationActionType;
  params: Record<string, unknown>;
}

export interface IAutomationRule {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string;
  trigger:        AutomationTrigger;
  conditions:     Record<string, unknown>;
  actions:        AutomationAction[];
  isActive:       boolean;
  runCount:       number;
  lastRunAt:      Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface AutomationRuleDocument extends Omit<IAutomationRule, 'id'>, Document {}

const AutomationActionSchema = new Schema(
  {
    type:   { type: String, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const AutomationRuleSchema = new Schema<AutomationRuleDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    description:    { type: String, default: '' },
    trigger:        { type: String, required: true, index: true },
    conditions:     { type: Schema.Types.Mixed, default: {} },
    actions:        { type: [AutomationActionSchema], default: [] },
    isActive:       { type: Boolean, default: true },
    runCount:       { type: Number, default: 0 },
    lastRunAt:      { type: Date, default: null },
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

AutomationRuleSchema.index({ organizationId: 1, trigger: 1, isActive: 1 });

export const AutomationRuleModel = model<AutomationRuleDocument>('AutomationRule', AutomationRuleSchema);
