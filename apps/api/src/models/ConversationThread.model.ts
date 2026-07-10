/**
 * ConversationThread.model.ts
 *
 * A unified conversation thread that aggregates messages across all channels.
 * One thread = one customer relationship, regardless of channel.
 */

import { Schema, model, Document } from 'mongoose';

export type ThreadChannel = 'widget' | 'email' | 'sms' | 'whatsapp' | 'messenger' | 'instagram' | 'voice' | 'internal';
export type ThreadStatus  = 'open' | 'resolved' | 'archived' | 'spam' | 'pending';
export type ThreadPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface IConversationThread {
  id:              string;
  organizationId:  string;
  leadId:          string | null;
  contactId:       string | null;
  assigneeId:      string | null;
  status:          ThreadStatus;
  priority:        ThreadPriority;
  channels:        ThreadChannel[];   // all channels used in this thread
  subject:         string;
  snippet:         string;            // last message preview
  unreadCount:     number;
  messageCount:    number;
  labels:          string[];
  isPinned:        boolean;
  isStarred:       boolean;
  isMentioned:     boolean;
  lastMessageAt:   Date | null;
  lastMessageBy:   string | null;
  resolvedAt:      Date | null;
  resolvedById:    string | null;
  aiSummary:       string | null;
  sentimentScore:  number | null;     // -1 to 1
  urgencyScore:    number | null;     // 0-100
  deletedAt:       Date | null;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface ConversationThreadDocument extends Omit<IConversationThread, 'id'>, Document {}

const ConversationThreadSchema = new Schema<ConversationThreadDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    leadId:         { type: String, default: null, index: true },
    contactId:      { type: String, default: null },
    assigneeId:     { type: String, default: null, index: true },
    status:         { type: String, enum: ['open','resolved','archived','spam','pending'], default: 'open' },
    priority:       { type: String, enum: ['urgent','high','normal','low'], default: 'normal' },
    channels:       { type: [String], default: [] },
    subject:        { type: String, default: '' },
    snippet:        { type: String, default: '' },
    unreadCount:    { type: Number, default: 0 },
    messageCount:   { type: Number, default: 0 },
    labels:         { type: [String], default: [] },
    isPinned:       { type: Boolean, default: false },
    isStarred:      { type: Boolean, default: false },
    isMentioned:    { type: Boolean, default: false },
    lastMessageAt:  { type: Date, default: null },
    lastMessageBy:  { type: String, default: null },
    resolvedAt:     { type: Date, default: null },
    resolvedById:   { type: String, default: null },
    aiSummary:      { type: String, default: null },
    sentimentScore: { type: Number, default: null },
    urgencyScore:   { type: Number, default: null },
    deletedAt:      { type: Date, default: null },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

ConversationThreadSchema.index({ organizationId: 1, status: 1, lastMessageAt: -1 });
ConversationThreadSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
ConversationThreadSchema.index({ organizationId: 1, leadId: 1 });
ConversationThreadSchema.index({ organizationId: 1, labels: 1 });
ConversationThreadSchema.index({ organizationId: 1, deletedAt: 1 });

export const ConversationThreadModel = model<ConversationThreadDocument>('ConversationThread', ConversationThreadSchema);
