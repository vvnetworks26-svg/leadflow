/**
 * Pipeline.model.ts
 *
 * Fully customizable sales pipeline per organization.
 * Each organization can have multiple pipelines (e.g. Sales, Support, Upsell).
 * Stages are embedded in the pipeline document for ordered retrieval.
 */

import { Schema, model, Document } from 'mongoose';

export interface IPipelineStage {
  id:          string;
  name:        string;
  color:       string;    // hex colour e.g. '#22c55e'
  probability: number;    // 0–100 win probability for this stage
  order:       number;    // display order (0-indexed)
  isWon:       boolean;   // marks the Won stage
  isLost:      boolean;   // marks the Lost stage
}

export interface IPipeline {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string;
  stages:         IPipelineStage[];
  isDefault:      boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface PipelineDocument extends Omit<IPipeline, 'id'>, Document {}

const PipelineStageSchema = new Schema<IPipelineStage>(
  {
    id:          { type: String, required: true },
    name:        { type: String, required: true, trim: true },
    color:       { type: String, default: '#6366f1' },
    probability: { type: Number, default: 0, min: 0, max: 100 },
    order:       { type: Number, required: true },
    isWon:       { type: Boolean, default: false },
    isLost:      { type: Boolean, default: false },
  },
  { _id: false }
);

const PipelineSchema = new Schema<PipelineDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    name:           { type: String, required: true, trim: true },
    description:    { type: String, default: '' },
    stages:         { type: [PipelineStageSchema], default: [] },
    isDefault:      { type: Boolean, default: false },
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

PipelineSchema.index({ organizationId: 1, isDefault: 1 });

export const PipelineModel = model<PipelineDocument>('Pipeline', PipelineSchema);

// ─── Default pipeline stages ──────────────────────────────────────────────────

export function defaultPipelineStages(): IPipelineStage[] {
  return [
    { id: 'stage_new',         name: 'New',         color: '#94a3b8', probability: 10,  order: 0, isWon: false, isLost: false },
    { id: 'stage_qualified',   name: 'Qualified',   color: '#3b82f6', probability: 25,  order: 1, isWon: false, isLost: false },
    { id: 'stage_contacted',   name: 'Contacted',   color: '#8b5cf6', probability: 40,  order: 2, isWon: false, isLost: false },
    { id: 'stage_proposal',    name: 'Proposal',    color: '#f59e0b', probability: 60,  order: 3, isWon: false, isLost: false },
    { id: 'stage_negotiation', name: 'Negotiation', color: '#f97316', probability: 80,  order: 4, isWon: false, isLost: false },
    { id: 'stage_won',         name: 'Won',         color: '#22c55e', probability: 100, order: 5, isWon: true,  isLost: false },
    { id: 'stage_lost',        name: 'Lost',        color: '#ef4444', probability: 0,   order: 6, isWon: false, isLost: true  },
  ];
}
