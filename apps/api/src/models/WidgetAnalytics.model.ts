/**
 * WidgetAnalytics.model.ts — Widget engagement analytics events.
 */

import { Schema, model, Document } from 'mongoose';

export type WidgetEventType =
  | 'impression' | 'open' | 'close' | 'message_sent' | 'message_received'
  | 'lead_qualified' | 'booking_created' | 'cta_clicked'
  | 'session_start' | 'session_end' | 'bounce' | 'variant_view';

export interface IWidgetAnalytics {
  organizationId: string;
  eventType:      WidgetEventType;
  sessionId:      string;
  variantId:      string | null;    // A/B test variant
  pageUrl:        string;
  referrer:       string;
  deviceType:     'desktop' | 'tablet' | 'mobile';
  locale:         string;
  durationMs:     number | null;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface WidgetAnalyticsDocument extends IWidgetAnalytics, Document {}

const WidgetAnalyticsSchema = new Schema<WidgetAnalyticsDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    eventType:      { type: String, required: true, index: true },
    sessionId:      { type: String, required: true },
    variantId:      { type: String, default: null },
    pageUrl:        { type: String, default: '' },
    referrer:       { type: String, default: '' },
    deviceType:     { type: String, enum: ['desktop','tablet','mobile'], default: 'desktop' },
    locale:         { type: String, default: 'en' },
    durationMs:     { type: Number, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
  }
);

WidgetAnalyticsSchema.index({ organizationId: 1, createdAt: -1 });
WidgetAnalyticsSchema.index({ organizationId: 1, eventType: 1, createdAt: -1 });
// TTL: auto-delete events older than 1 year
WidgetAnalyticsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86400 });

export const WidgetAnalyticsModel = model<WidgetAnalyticsDocument>('WidgetAnalytics', WidgetAnalyticsSchema);
