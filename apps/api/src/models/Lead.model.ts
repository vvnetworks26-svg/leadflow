/**
 * Lead.model.ts — Upgraded for full CRM Pipeline Management.
 *
 * Backwards-compatible: all existing fields preserved.
 * New fields: pipeline, stage, owner, lifecycle, AI summaries,
 * custom fields, duplicate tracking, expected close, win/lost metadata.
 */

import { Schema, model, Document } from 'mongoose';

export type LeadStatus =
  | 'New' | 'Contacted' | 'Qualified' | 'Unqualified'
  | 'Proposal' | 'Closed Won' | 'Closed Lost';

export type LeadPriority   = 'Low' | 'Medium' | 'High';
export type LeadTemperature = 'Hot' | 'Warm' | 'Cold' | 'Disqualified';
export type LifecycleStage =
  | 'subscriber' | 'lead' | 'marketing_qualified' | 'sales_qualified'
  | 'opportunity' | 'customer' | 'evangelist' | 'other';

export interface ILead {
  id:                  string;
  organizationId:      string;

  // Core identity
  name:                string;
  email:               string;
  phone:               string;
  address:             string;
  zipCode?:            string;
  company?:            string;
  jobTitle?:           string;

  // Pipeline
  pipelineId:          string | null;
  stageId:             string | null;
  stageName:           string | null;

  // Classification
  status:              LeadStatus;
  priority:            LeadPriority;
  temperature:         LeadTemperature;
  lifecycleStage:      LifecycleStage;
  score:               number;

  // Financials
  value:               number;
  estimatedValue:      number;
  expectedCloseDate:   Date | null;
  wonDate:             Date | null;
  lostReason:          string | null;

  // Attribution
  source:              string;
  ownerId:             string | null;
  tags:                string[];

  // Contact tracking
  lastContactAt:       Date | null;
  nextFollowUpAt:      Date | null;
  activityCount:       number;
  taskCount:           number;

  // Domain-specific (legacy)
  hvacNeed:            string;
  emergency:           boolean;
  conversationId?:     string;
  qualificationReason?: string;
  preferredDay?:       string;
  appointmentId?:      string;
  notes:               string;

  // AI
  aiSummary:           string | null;
  conversationSummary: string | null;
  winProbability:      number | null;
  riskScore:           number | null;

  // Duplicate tracking
  duplicateOfId:       string | null;
  mergedIds:           string[];

  // Custom fields (org-defined key→value)
  customFields:        Record<string, unknown>;

  createdAt:           Date;
  updatedAt:           Date;
}

export interface LeadDocument extends Omit<ILead, 'id'>, Document {}

const LeadSchema = new Schema<LeadDocument>(
  {
    organizationId:      { type: String, required: true, index: true },

    // Core identity
    name:                { type: String, required: true, trim: true },
    email:               { type: String, trim: true, lowercase: true, default: '' },
    phone:               { type: String, required: true, trim: true },
    address:             { type: String, default: '' },
    zipCode:             { type: String, trim: true },
    company:             { type: String, trim: true },
    jobTitle:            { type: String, trim: true },

    // Pipeline
    pipelineId:          { type: String, default: null },
    stageId:             { type: String, default: null },
    stageName:           { type: String, default: null },

    // Classification
    status:              { type: String, enum: ['New','Contacted','Qualified','Unqualified','Proposal','Closed Won','Closed Lost'], default: 'New' },
    priority:            { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
    temperature:         { type: String, enum: ['Hot','Warm','Cold','Disqualified'], default: 'Cold' },
    lifecycleStage:      { type: String, enum: ['subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','other'], default: 'lead' },
    score:               { type: Number, default: 0, min: 0, max: 100 },

    // Financials
    value:               { type: Number, default: 0 },
    estimatedValue:      { type: Number, default: 0 },
    expectedCloseDate:   { type: Date, default: null },
    wonDate:             { type: Date, default: null },
    lostReason:          { type: String, default: null },

    // Attribution
    source:              { type: String, default: '' },
    ownerId:             { type: String, default: null, index: true },
    tags:                { type: [String], default: [] },

    // Contact tracking
    lastContactAt:       { type: Date, default: null },
    nextFollowUpAt:      { type: Date, default: null },
    activityCount:       { type: Number, default: 0 },
    taskCount:           { type: Number, default: 0 },

    // Legacy domain-specific
    hvacNeed:            { type: String, required: true, default: 'General inquiry' },
    emergency:           { type: Boolean, default: false },
    conversationId:      { type: String },
    qualificationReason: { type: String },
    preferredDay:        { type: String },
    appointmentId:       { type: String },
    notes:               { type: String, default: '' },

    // AI
    aiSummary:           { type: String, default: null },
    conversationSummary: { type: String, default: null },
    winProbability:      { type: Number, default: null },
    riskScore:           { type: Number, default: null },

    // Duplicates
    duplicateOfId:       { type: String, default: null },
    mergedIds:           { type: [String], default: [] },

    // Custom fields
    customFields:        { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
LeadSchema.index({ organizationId: 1, createdAt: -1 });
LeadSchema.index({ organizationId: 1, status: 1 });
LeadSchema.index({ organizationId: 1, ownerId: 1 });
LeadSchema.index({ organizationId: 1, pipelineId: 1, stageId: 1 });
LeadSchema.index({ organizationId: 1, score: -1 });
LeadSchema.index({ organizationId: 1, temperature: 1 });
LeadSchema.index({ organizationId: 1, tags: 1 });
LeadSchema.index({ organizationId: 1, source: 1 });
LeadSchema.index({ organizationId: 1, email: 1 });
LeadSchema.index({ organizationId: 1, phone: 1 });
// Full-text search
LeadSchema.index(
  { name: 'text', email: 'text', phone: 'text', company: 'text', notes: 'text', hvacNeed: 'text' },
  { name: 'lead_text_search', weights: { name: 10, email: 8, phone: 8, company: 5, hvacNeed: 3 } }
);

export const LeadModel = model<LeadDocument>('Lead', LeadSchema);
