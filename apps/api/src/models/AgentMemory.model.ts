/**
 * AgentMemory.model.ts — Persistent agent memory entries.
 * Stores short-term and long-term memories with semantic retrieval keys.
 */

import { Schema, model, Document } from 'mongoose';

export type MemoryType = 'short_term' | 'long_term' | 'conversation' | 'customer' | 'organization';

export interface IAgentMemory {
  id:             string;
  organizationId: string;
  agentId:        string;
  sessionId:      string | null;
  leadId:         string | null;
  type:           MemoryType;
  key:            string;          // retrieval key
  content:        string;
  summary:        string;
  importance:     number;          // 0-10, used for pruning
  accessCount:    number;
  lastAccessedAt: Date | null;
  expiresAt:      Date | null;     // null = permanent
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface AgentMemoryDocument extends Omit<IAgentMemory, 'id'>, Document {}

const AgentMemorySchema = new Schema<AgentMemoryDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    agentId:        { type: String, required: true, index: true },
    sessionId:      { type: String, default: null },
    leadId:         { type: String, default: null },
    type:           { type: String, enum: ['short_term','long_term','conversation','customer','organization'], default: 'short_term' },
    key:            { type: String, required: true },
    content:        { type: String, required: true },
    summary:        { type: String, default: '' },
    importance:     { type: Number, default: 5, min: 0, max: 10 },
    accessCount:    { type: Number, default: 0 },
    lastAccessedAt: { type: Date, default: null },
    expiresAt:      { type: Date, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

AgentMemorySchema.index({ organizationId: 1, agentId: 1, type: 1 });
AgentMemorySchema.index({ organizationId: 1, leadId: 1 });
AgentMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
// Text search for semantic retrieval
AgentMemorySchema.index({ key: 'text', content: 'text', summary: 'text' }, { name: 'memory_text_search' });

export const AgentMemoryModel = model<AgentMemoryDocument>('AgentMemory', AgentMemorySchema);
