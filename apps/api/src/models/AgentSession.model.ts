/**
 * AgentSession.model.ts — Tracks a single agent conversation session.
 * TTL: auto-deleted 90 days after last activity.
 */

import { Schema, model, Document } from 'mongoose';

export interface IReasoningStep {
  step:      number;
  type:      'observe' | 'think' | 'plan' | 'execute' | 'verify' | 'reflect';
  content:   string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?:Record<string, unknown>;
  durationMs?:number;
  timestamp:  Date;
}

export interface IAgentSession {
  id:             string;
  organizationId: string;
  agentId:        string;
  userId:         string | null;
  leadId:         string | null;
  threadId:       string | null;   // comms thread if applicable
  status:         'active' | 'completed' | 'failed' | 'timeout';
  messages:       Array<{ role: 'user' | 'assistant' | 'tool'; content: string; timestamp: Date }>;
  reasoningTrace: IReasoningStep[];
  toolCalls:      number;
  memoryHits:     number;
  knowledgeHits:  number;
  totalTokens:    number;
  totalLatencyMs: number;
  lastActivityAt: Date;
  deletedAt:      Date | null;
  createdAt:      Date;
}

export interface AgentSessionDocument extends Omit<IAgentSession, 'id'>, Document {}

const AgentSessionSchema = new Schema<AgentSessionDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    agentId:        { type: String, required: true, index: true },
    userId:         { type: String, default: null },
    leadId:         { type: String, default: null },
    threadId:       { type: String, default: null },
    status:         { type: String, enum: ['active','completed','failed','timeout'], default: 'active' },
    messages:       { type: Schema.Types.Mixed, default: [] },
    reasoningTrace: { type: Schema.Types.Mixed, default: [] },
    toolCalls:      { type: Number, default: 0 },
    memoryHits:     { type: Number, default: 0 },
    knowledgeHits:  { type: Number, default: 0 },
    totalTokens:    { type: Number, default: 0 },
    totalLatencyMs: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
    deletedAt:      { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

AgentSessionSchema.index({ organizationId: 1, agentId: 1, createdAt: -1 });
AgentSessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const AgentSessionModel = model<AgentSessionDocument>('AgentSession', AgentSessionSchema);
