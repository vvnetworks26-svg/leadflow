/**
 * CommunicationMessage.model.ts
 *
 * A single message in a conversation thread.
 * Supports all channel types with channel-specific metadata.
 */

import { Schema, model, Document } from 'mongoose';
import type { ThreadChannel } from './ConversationThread.model';

export type MessageDirection = 'inbound' | 'outbound' | 'internal';
export type MessageStatus    = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
export type MessageType      = 'text' | 'html' | 'template' | 'media' | 'voice' | 'system' | 'note';

export interface ICommunicationMessage {
  id:              string;
  organizationId:  string;
  threadId:        string;
  channel:         ThreadChannel;
  direction:       MessageDirection;
  messageType:     MessageType;
  status:          MessageStatus;
  fromAddress:     string;     // email/phone/user ID
  toAddresses:     string[];
  subject:         string;
  body:            string;     // plain text or HTML
  bodyHtml:        string;
  senderId:        string | null;    // userId if staff
  senderName:      string;
  attachmentIds:   string[];
  externalId:      string | null;    // provider message ID
  metadata:        Record<string, unknown>;   // channel-specific data
  isRead:          boolean;
  readAt:          Date | null;
  deliveredAt:     Date | null;
  failedAt:        Date | null;
  failureReason:   string | null;
  retryCount:      number;
  scheduledAt:     Date | null;
  deletedAt:       Date | null;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface CommunicationMessageDocument extends Omit<ICommunicationMessage, 'id'>, Document {}

const CommunicationMessageSchema = new Schema<CommunicationMessageDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    threadId:       { type: String, required: true, index: true },
    channel:        { type: String, required: true },
    direction:      { type: String, enum: ['inbound','outbound','internal'], required: true },
    messageType:    { type: String, enum: ['text','html','template','media','voice','system','note'], default: 'text' },
    status:         { type: String, enum: ['pending','sent','delivered','read','failed','bounced'], default: 'pending' },
    fromAddress:    { type: String, default: '' },
    toAddresses:    { type: [String], default: [] },
    subject:        { type: String, default: '' },
    body:           { type: String, default: '' },
    bodyHtml:       { type: String, default: '' },
    senderId:       { type: String, default: null },
    senderName:     { type: String, default: '' },
    attachmentIds:  { type: [String], default: [] },
    externalId:     { type: String, default: null },
    metadata:       { type: Schema.Types.Mixed, default: {} },
    isRead:         { type: Boolean, default: false },
    readAt:         { type: Date, default: null },
    deliveredAt:    { type: Date, default: null },
    failedAt:       { type: Date, default: null },
    failureReason:  { type: String, default: null },
    retryCount:     { type: Number, default: 0 },
    scheduledAt:    { type: Date, default: null },
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

CommunicationMessageSchema.index({ organizationId: 1, threadId: 1, createdAt: 1 });
CommunicationMessageSchema.index({ organizationId: 1, channel: 1, createdAt: -1 });
CommunicationMessageSchema.index({ organizationId: 1, status: 1 });
CommunicationMessageSchema.index({ organizationId: 1, scheduledAt: 1, status: 1 });

export const CommunicationMessageModel = model<CommunicationMessageDocument>('CommunicationMessage', CommunicationMessageSchema);
