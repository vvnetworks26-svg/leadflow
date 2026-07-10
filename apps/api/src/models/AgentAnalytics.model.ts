/**
 * AgentAnalytics.model.ts — Agent performance event log.
 */

import { Schema, model, Document } from 'mongoose';

export type AgentEventType =
  | 'session_started' | 'session_completed' | 'session_failed'
  | 'tool_called' | 'tool_succeeded' | 'tool_failed'
  | 'memory_hit' | 'knowledge_hit' | 'reflection_triggered'
  | 'safety_blocked' | 'handoff_triggered';

export interface IAgentAnalytics {
  organizationId: string;
  agentId:        string;
  sessionId:      string;
  eventType:      AgentEventType;
  toolName:       string | null;
  latencyMs:      number | null;
  tokenCount:     number | null;
  confidence:     number | null;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface AgentAnalyticsDocument extends IAgentAnalytics, Document {}

const AgentAnalyticsSchema = new Schema<AgentAnalyticsDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    agentId:        { type: String, required: true, index: true },
    sessionId:      { type: String, required: true },
    eventType:      { type: String, required: true, index: true },
    toolName:       { type: String, default: null },
    latencyMs:      { type: Number, default: null },
    tokenCount:     { type: Number, default: null },
    confidence:     { type: Number, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
  }
);

AgentAnalyticsSchema.index({ organizationId: 1, createdAt: -1 });
AgentAnalyticsSchema.index({ organizationId: 1, agentId: 1, eventType: 1 });
AgentAnalyticsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86400 });

export const AgentAnalyticsModel = model<AgentAnalyticsDocument>('AgentAnalytics', AgentAnalyticsSchema);
