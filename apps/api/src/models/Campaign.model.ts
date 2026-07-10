/**
 * Campaign.model.ts — Bulk messaging campaigns (email/SMS/mixed).
 */

import { Schema, model, Document } from 'mongoose';
import type { ThreadChannel } from './ConversationThread.model';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed';

export interface IAudience {
  type:         'all' | 'filter' | 'list';
  filters?:     Record<string, unknown>;
  recipientIds?:string[];
}

export interface ICampaignStats {
  total:       number;
  sent:        number;
  delivered:   number;
  opened:      number;
  clicked:     number;
  bounced:     number;
  unsubscribed:number;
  failed:      number;
}

export interface ICampaign {
  id:             string;
  organizationId: string;
  name:           string;
  channel:        ThreadChannel;
  status:         CampaignStatus;
  templateId:     string | null;
  subject:        string;
  body:           string;
  audience:       IAudience;
  stats:          ICampaignStats;
  scheduledAt:    Date | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  suppressionList:string[];
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface CampaignDocument extends Omit<ICampaign, 'id'>, Document {}

const CampaignSchema = new Schema<CampaignDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true },
    channel:        { type: String, required: true },
    status:         { type: String, enum: ['draft','scheduled','sending','sent','paused','cancelled','failed'], default: 'draft' },
    templateId:     { type: String, default: null },
    subject:        { type: String, default: '' },
    body:           { type: String, default: '' },
    audience:       { type: Schema.Types.Mixed, default: { type: 'all' } },
    stats:          { type: Schema.Types.Mixed, default: { total:0,sent:0,delivered:0,opened:0,clicked:0,bounced:0,unsubscribed:0,failed:0 } },
    scheduledAt:    { type: Date, default: null },
    startedAt:      { type: Date, default: null },
    completedAt:    { type: Date, default: null },
    suppressionList:{ type: [String], default: [] },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

CampaignSchema.index({ organizationId: 1, status: 1 });
CampaignSchema.index({ organizationId: 1, scheduledAt: 1, status: 1 });

export const CampaignModel = model<CampaignDocument>('Campaign', CampaignSchema);
