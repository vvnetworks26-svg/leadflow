/**
 * CommunicationAttachment.model.ts — File attachments for messages.
 */

import { Schema, model, Document } from 'mongoose';

export type AttachmentType = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'other';

export interface ICommunicationAttachment {
  id:             string;
  organizationId: string;
  messageId:      string;
  threadId:       string;
  filename:       string;
  mimeType:       string;
  type:           AttachmentType;
  url:            string;
  sizeBytes:      number;
  width:          number | null;
  height:         number | null;
  duration:       number | null;    // seconds for audio/video
  virusScanStatus:'pending' | 'clean' | 'infected' | 'skipped';
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface CommunicationAttachmentDocument extends Omit<ICommunicationAttachment, 'id'>, Document {}

const CommunicationAttachmentSchema = new Schema<CommunicationAttachmentDocument>(
  {
    organizationId:  { type: String, required: true, index: true },
    messageId:       { type: String, required: true, index: true },
    threadId:        { type: String, required: true },
    filename:        { type: String, required: true },
    mimeType:        { type: String, required: true },
    type:            { type: String, enum: ['image','video','audio','pdf','document','spreadsheet','archive','other'], default: 'other' },
    url:             { type: String, required: true },
    sizeBytes:       { type: Number, default: 0 },
    width:           { type: Number, default: null },
    height:          { type: Number, default: null },
    duration:        { type: Number, default: null },
    virusScanStatus: { type: String, enum: ['pending','clean','infected','skipped'], default: 'pending' },
    metadata:        { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

export const CommunicationAttachmentModel = model<CommunicationAttachmentDocument>('CommunicationAttachment', CommunicationAttachmentSchema);
