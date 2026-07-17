/**
 * AIConversationSession.model.ts
 *
 * Persists the AI conversation state between turns.
 * One document per conversation — updated on every AI response.
 * Stores: stage, memory, history (capped), qualification snapshot.
 *
 * Indexed by organizationId for multi-tenant isolation.
 * TTL: auto-deleted 90 days after last activity.
 *
 * v2.1 additions (all additive — no existing fields removed or renamed):
 *   - widgetSessionId: external browser-facing token (UUID v4)
 *   - seq:             optimistic concurrency counter
 *   - status:          session lifecycle state
 *   - schemaVersion:   client-side cache-busting version
 *   - progress:        typed sub-document (replaces Schema.Types.Mixed)
 */

import { Schema, model, Document } from 'mongoose';
import type { ConversationStage, ConversationMemory, ChatMessage, QualificationScore } from '../ai/types';

// ─── Progress sub-document interface ─────────────────────────────────────────

export interface IConversationProgress {
  visitorNameCollected:  boolean;
  companyCollected:      boolean;
  phoneCollected:        boolean;
  emailCollected:        boolean;
  addressCollected:      boolean;
  painCollected:         boolean;
  budgetCollected:       boolean;
  timelineCollected:     boolean;
  appointmentCollected:  boolean;
  serviceCollected:      boolean;
  emergencyCollected:    boolean;
}

// ─── Session status ───────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'archived' | 'booked';

// ─── Top-level document interface ────────────────────────────────────────────

export interface IAIConversationSession {
  organizationId:   string;
  conversationId:   string;            // links to Conversation document
  stage:            ConversationStage;
  memory:           ConversationMemory;
  history:          ChatMessage[];     // capped at last 30 turns
  qualification:    QualificationScore | null;
  turnCount:        number;
  lastActivity:     Date;
  createdAt:        Date;

  // v2.1 additions
  widgetSessionId?: string;            // UUID v4, browser-facing token; optional so existing docs remain valid
  seq:              number;            // optimistic concurrency token — never sent to client
  status:           SessionStatus;     // session lifecycle state
  schemaVersion:    number;            // incremented when memory/progress shape changes
  progress:         IConversationProgress; // typed sub-document; replaces Schema.Types.Mixed
}

export interface AIConversationSessionDocument extends Omit<IAIConversationSession, 'createdAt'>, Document {}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const ChatMessageSchema = new Schema(
  { role: String, content: String },
  { _id: false }
);

/**
 * Typed progress sub-document.
 * Enables dot-notation queries: { "progress.phoneCollected": true }
 * All 11 fields default to false so existing documents without this
 * sub-document are populated correctly on first read.
 */
const ProgressSchema = new Schema<IConversationProgress>(
  {
    visitorNameCollected:  { type: Boolean, default: false },
    companyCollected:      { type: Boolean, default: false },
    phoneCollected:        { type: Boolean, default: false },
    emailCollected:        { type: Boolean, default: false },
    addressCollected:      { type: Boolean, default: false },
    painCollected:         { type: Boolean, default: false },
    budgetCollected:       { type: Boolean, default: false },
    timelineCollected:     { type: Boolean, default: false },
    appointmentCollected:  { type: Boolean, default: false },
    serviceCollected:      { type: Boolean, default: false },
    emergencyCollected:    { type: Boolean, default: false },
  },
  { _id: false }
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const AIConversationSessionSchema = new Schema<AIConversationSessionDocument>(
  {
    // ── Existing fields (unchanged) ──────────────────────────────────────────
    organizationId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, unique: true, index: true },
    stage:          { type: String, default: 'greeting' },
    memory:         { type: Schema.Types.Mixed, default: {} },
    history:        { type: [ChatMessageSchema], default: [] },
    qualification:  { type: Schema.Types.Mixed, default: null },
    turnCount:      { type: Number, default: 0 },
    lastActivity:   { type: Date, default: Date.now },

    // ── v2.1 additions ───────────────────────────────────────────────────────
    // widgetSessionId: optional (no `required`) so existing docs without it remain valid.
    // Compound unique sparse index defined below.
    widgetSessionId: { type: String, sparse: true },

    // Optimistic concurrency token. Defaults to 0; never sent to the client.
    // The CAS query pattern: findOneAndUpdate({ _id, seq: N }, { $inc: { seq: 1 } })
    seq: { type: Number, default: 0, required: true },

    // Session lifecycle state. Indexed for expiry-job query performance.
    status: {
      type:    String,
      enum:    ['active', 'archived', 'booked'],
      default: 'active',
      index:   true,
    },

    // Incremented when the memory/progress shape changes in a breaking way.
    // Allows the frontend to detect stale localStorage and discard it.
    schemaVersion: { type: Number, default: 1 },

    // Typed sub-document replacing the former Schema.Types.Mixed `progress` field.
    // All existing code that read progress as Mixed continues to work; the values
    // are now individually typed and queryable via dot-notation.
    progress: { type: ProgressSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Existing indexes — retained unchanged
AIConversationSessionSchema.index({ organizationId: 1, lastActivity: -1 });
AIConversationSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// v2.1: compound unique sparse index for widgetSessionId lookups.
// sparse: true means documents without widgetSessionId are excluded from the
// uniqueness check, so old documents without the field remain valid.
AIConversationSessionSchema.index(
  { widgetSessionId: 1, organizationId: 1 },
  { sparse: true, unique: true }
);

// v2.1: compound index to accelerate the Session_Expiry_Job query:
//   { status: 'active', lastActivity: { $lt: cutoff } }
AIConversationSessionSchema.index({ status: 1, lastActivity: 1 });

// ─── Model export ─────────────────────────────────────────────────────────────

export const AIConversationSessionModel = model<AIConversationSessionDocument>(
  'AIConversationSession',
  AIConversationSessionSchema
);
