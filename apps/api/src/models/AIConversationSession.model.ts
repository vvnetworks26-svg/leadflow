/**
 * AIConversationSession.model.ts
 *
 * Persists the AI conversation state between turns.
 * One document per conversation — updated on every AI response.
 * Stores: stage, memory, history (capped), qualification snapshot.
 *
 * Indexed by organizationId for multi-tenant isolation.
 * TTL: auto-deleted 90 days after last activity.
 */

import { Schema, model, Document } from 'mongoose';
import type { ConversationStage, ConversationMemory, ChatMessage, QualificationScore } from '../ai/types';

export interface IAIConversationSession {
  organizationId:  string;
  conversationId:  string;          // links to Conversation document
  stage:           ConversationStage;
  memory:          ConversationMemory;
  history:         ChatMessage[];   // capped at last 30 turns
  qualification:   QualificationScore | null;
  turnCount:       number;
  lastActivity:    Date;
  createdAt:       Date;
}

export interface AIConversationSessionDocument extends Omit<IAIConversationSession, 'createdAt'>, Document {}

const ChatMessageSchema = new Schema(
  { role: String, content: String },
  { _id: false }
);

const AIConversationSessionSchema = new Schema<AIConversationSessionDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, unique: true, index: true },
    stage:          { type: String, default: 'greeting' },
    memory:         { type: Schema.Types.Mixed, default: {} },
    history:        { type: [ChatMessageSchema], default: [] },
    qualification:  { type: Schema.Types.Mixed, default: null },
    turnCount:      { type: Number, default: 0 },
    lastActivity:   { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Multi-tenant compound index
AIConversationSessionSchema.index({ organizationId: 1, lastActivity: -1 });

// TTL: auto-delete 90 days after last activity
AIConversationSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AIConversationSessionModel = model<AIConversationSessionDocument>(
  'AIConversationSession',
  AIConversationSessionSchema
);
