/**
 * InboxRule.model.ts — Auto-routing rules for the shared inbox.
 */

import { Schema, model, Document } from 'mongoose';

export type InboxRuleAction = 'assign' | 'label' | 'priority' | 'archive' | 'spam' | 'notify';

export interface IInboxRule {
  id:             string;
  organizationId: string;
  name:           string;
  isActive:       boolean;
  conditions:     Record<string, unknown>;
  actions:        Array<{ type: InboxRuleAction; params: Record<string, unknown> }>;
  priority:       number;
  runCount:       number;
  createdAt:      Date;
}

export interface InboxRuleDocument extends Omit<IInboxRule, 'id'>, Document {}

const InboxRuleSchema = new Schema<InboxRuleDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true },
    isActive:       { type: Boolean, default: true },
    conditions:     { type: Schema.Types.Mixed, default: {} },
    actions:        { type: Schema.Types.Mixed, default: [] },
    priority:       { type: Number, default: 0 },
    runCount:       { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const InboxRuleModel = model<InboxRuleDocument>('InboxRule', InboxRuleSchema);
