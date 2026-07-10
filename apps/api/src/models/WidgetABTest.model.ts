/**
 * WidgetABTest.model.ts — A/B test definitions and variant tracking.
 */

import { Schema, model, Document } from 'mongoose';

export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface IABVariant {
  id:            string;
  name:          string;           // e.g. 'Variant A', 'Variant B'
  trafficPercent:number;           // 0–100, all variants must sum to 100
  configOverride:Record<string, unknown>;   // delta from base config
  impressions:   number;
  opens:         number;
  leads:         number;
  bookings:      number;
}

export interface IWidgetABTest {
  id:              string;
  organizationId:  string;
  name:            string;
  status:          ABTestStatus;
  variants:        IABVariant[];
  winnerVariantId: string | null;
  startedAt:       Date | null;
  endedAt:         Date | null;
  goal:            'leads' | 'bookings' | 'opens';
  confidenceLevel: number;         // % statistical confidence for winner detection
  createdAt:       Date;
  updatedAt:       Date;
}

export interface WidgetABTestDocument extends Omit<IWidgetABTest, 'id'>, Document {}

const ABVariantSchema = new Schema(
  {
    id: String, name: String, trafficPercent: Number,
    configOverride: Schema.Types.Mixed, impressions: { type: Number, default: 0 },
    opens: { type: Number, default: 0 }, leads: { type: Number, default: 0 },
    bookings: { type: Number, default: 0 },
  },
  { _id: false }
);

const WidgetABTestSchema = new Schema<WidgetABTestDocument>(
  {
    organizationId:  { type: String, required: true, index: true },
    name:            { type: String, required: true },
    status:          { type: String, enum: ['draft','running','paused','completed'], default: 'draft' },
    variants:        { type: [ABVariantSchema], default: [] },
    winnerVariantId: { type: String, default: null },
    startedAt:       { type: Date, default: null },
    endedAt:         { type: Date, default: null },
    goal:            { type: String, enum: ['leads','bookings','opens'], default: 'leads' },
    confidenceLevel: { type: Number, default: 95 },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const WidgetABTestModel = model<WidgetABTestDocument>('WidgetABTest', WidgetABTestSchema);
