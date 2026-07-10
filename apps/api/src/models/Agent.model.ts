/**
 * Agent.model.ts — AI Agent definition per organization.
 */

import { Schema, model, Document } from 'mongoose';

export type AgentRole = 'sales' | 'support' | 'booking' | 'crm' | 'analytics' | 'workflow' | 'assistant' | 'custom';

export interface ITool { name: string; enabled: boolean; permissions: string[] }

export interface IAgent {
  id:             string;
  organizationId: string;
  name:           string;
  role:           AgentRole;
  description:    string;
  systemPrompt:   string;
  isActive:       boolean;
  tools:          ITool[];
  knowledgeBaseIds: string[];
  maxSteps:       number;
  temperature:    number;
  llmModel:       string;
  memoryEnabled:  boolean;
  reflectionEnabled: boolean;
  metadata:       Record<string, unknown>;
  usageCount:     number;
  createdById:    string;
  deletedAt:      Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface AgentDocument extends Omit<IAgent, 'id'>, Document {}

const AgentSchema = new Schema<AgentDocument>(
  {
    organizationId:    { type: String, required: true, index: true },
    name:              { type: String, required: true, trim: true },
    role:              { type: String, enum: ['sales','support','booking','crm','analytics','workflow','assistant','custom'], default: 'assistant' },
    description:       { type: String, default: '' },
    systemPrompt:      { type: String, default: '' },
    isActive:          { type: Boolean, default: true },
    tools:             { type: Schema.Types.Mixed, default: [] },
    knowledgeBaseIds:  { type: [String], default: [] },
    maxSteps:          { type: Number, default: 10 },
    temperature:       { type: Number, default: 0.7 },
    llmModel:          { type: String, default: 'gemini-1.5-flash' },
    memoryEnabled:     { type: Boolean, default: true },
    reflectionEnabled: { type: Boolean, default: true },
    metadata:          { type: Schema.Types.Mixed, default: {} },
    usageCount:        { type: Number, default: 0 },
    createdById:       { type: String, required: true },
    deletedAt:         { type: Date, default: null },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

AgentSchema.index({ organizationId: 1, role: 1 });
AgentSchema.index({ organizationId: 1, isActive: 1 });

export const AgentModel = model<AgentDocument>('Agent', AgentSchema);
