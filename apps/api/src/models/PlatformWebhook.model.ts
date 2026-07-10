/**
 * PlatformWebhook.model.ts — Outgoing webhook subscriptions with delivery tracking.
 */

import { Schema, model, Document } from 'mongoose';

export type WebhookEvent =
  | 'lead.created' | 'lead.updated' | 'lead.qualified' | 'lead.won' | 'lead.lost'
  | 'booking.created' | 'booking.cancelled' | 'booking.completed'
  | 'conversation.started' | 'conversation.completed'
  | 'invoice.paid' | 'payment.failed'
  | 'workflow.completed' | 'workflow.failed'
  | 'campaign.completed' | 'agent.session.completed'
  | '*';   // subscribe to all

export type WebhookStatus = 'active' | 'paused' | 'failed';

export interface IDeliveryLog {
  attemptedAt: Date;
  statusCode:  number;
  success:     boolean;
  error:       string | null;
  durationMs:  number;
}

export interface IPlatformWebhook {
  id:             string;
  organizationId: string;
  name:           string;
  url:            string;
  events:         WebhookEvent[];
  secret:         string;          // HMAC signing secret (select: false)
  status:         WebhookStatus;
  isActive:       boolean;
  retryPolicy:    { maxAttempts: number; backoffSeconds: number };
  headers:        Record<string, string>;
  deliveryLogs:   IDeliveryLog[];  // last 10 deliveries
  successCount:   number;
  failureCount:   number;
  lastDeliveredAt:Date | null;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface PlatformWebhookDocument extends Omit<IPlatformWebhook, 'id'>, Document {}

const DeliveryLogSchema = new Schema(
  { attemptedAt: Date, statusCode: Number, success: Boolean, error: String, durationMs: Number },
  { _id: false }
);

const PlatformWebhookSchema = new Schema<PlatformWebhookDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true },
    url:            { type: String, required: true },
    events:         { type: [String], default: [] },
    secret:         { type: String, required: true, select: false },
    status:         { type: String, enum: ['active','paused','failed'], default: 'active' },
    isActive:       { type: Boolean, default: true },
    retryPolicy:    { type: Schema.Types.Mixed, default: { maxAttempts: 3, backoffSeconds: 60 } },
    headers:        { type: Schema.Types.Mixed, default: {} },
    deliveryLogs:   { type: [DeliveryLogSchema], default: [] },
    successCount:   { type: Number, default: 0 },
    failureCount:   { type: Number, default: 0 },
    lastDeliveredAt:{ type: Date, default: null },
    createdById:    { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; delete (ret as any).secret; return ret; } },
  }
);

PlatformWebhookSchema.index({ organizationId: 1, isActive: 1 });
export const PlatformWebhookModel = model<PlatformWebhookDocument>('PlatformWebhook', PlatformWebhookSchema);
