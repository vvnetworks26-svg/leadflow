/**
 * MeetingType.model.ts
 *
 * Organization-scoped meeting type configuration.
 * Each type defines duration, color, routing rules, buffer rules, and more.
 */

import { Schema, model, Document } from 'mongoose';

export type RoutingStrategy = 'round_robin' | 'least_busy' | 'priority' | 'specific' | 'department';

export interface IBufferRule {
  before:  number;   // minutes before meeting
  after:   number;   // minutes after meeting
  travel:  number;   // travel time minutes
  cleanup: number;   // cleanup time minutes
}

export interface IRoutingRule {
  strategy:    RoutingStrategy;
  assigneeIds: string[];          // specific user IDs for 'specific' strategy
  department?: string;
  skillTags?:  string[];
}

export interface IMeetingType {
  id:             string;
  organizationId: string;
  name:           string;
  slug:           string;          // URL-safe, unique per org
  description:    string;
  durationMinutes:number;
  color:          string;
  location:       string;          // 'video', 'phone', 'in_person', custom text
  videoLink:      string;          // Zoom / Meet / Teams link
  isActive:       boolean;
  bufferRules:    IBufferRule;
  routingRules:   IRoutingRule;
  maxAdvanceDays: number;          // how far ahead can be booked (default 60)
  minNoticeHours: number;          // minimum notice before booking (default 1)
  customFields:   Array<{ label: string; type: string; required: boolean }>;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface MeetingTypeDocument extends Omit<IMeetingType, 'id'>, Document {}

const BufferRuleSchema = new Schema(
  { before: { type: Number, default: 0 }, after: { type: Number, default: 0 },
    travel:  { type: Number, default: 0 }, cleanup: { type: Number, default: 0 } },
  { _id: false }
);

const RoutingRuleSchema = new Schema(
  { strategy:    { type: String, default: 'round_robin' },
    assigneeIds: { type: [String], default: [] },
    department:  String,
    skillTags:   [String] },
  { _id: false }
);

const MeetingTypeSchema = new Schema<MeetingTypeDocument>(
  {
    organizationId:  { type: String, required: true, index: true },
    name:            { type: String, required: true, trim: true },
    slug:            { type: String, required: true, trim: true, lowercase: true },
    description:     { type: String, default: '' },
    durationMinutes: { type: Number, required: true, default: 30 },
    color:           { type: String, default: '#6366f1' },
    location:        { type: String, default: 'video' },
    videoLink:       { type: String, default: '' },
    isActive:        { type: Boolean, default: true },
    bufferRules:     { type: BufferRuleSchema, default: () => ({ before: 0, after: 15, travel: 0, cleanup: 0 }) },
    routingRules:    { type: RoutingRuleSchema, default: () => ({ strategy: 'round_robin', assigneeIds: [] }) },
    maxAdvanceDays:  { type: Number, default: 60 },
    minNoticeHours:  { type: Number, default: 1 },
    customFields:    { type: Schema.Types.Mixed, default: [] },
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

MeetingTypeSchema.index({ organizationId: 1, slug: 1 }, { unique: true });

export const MeetingTypeModel = model<MeetingTypeDocument>('MeetingType', MeetingTypeSchema);
