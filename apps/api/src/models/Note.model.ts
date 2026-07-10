/**
 * Note.model.ts
 *
 * Internal rich-text notes on leads, contacts, and companies.
 * Notes are internal-only and never exposed to the end customer.
 * Supports pinning, user mentions, and AI-generated summaries.
 */

import { Schema, model, Document } from 'mongoose';

export interface INote {
  id:             string;
  organizationId: string;
  leadId:         string | null;
  contactId:      string | null;
  companyId:      string | null;
  authorId:       string;
  content:        string;          // markdown / rich text
  isPinned:       boolean;
  isAIGenerated:  boolean;
  mentionedUsers: string[];        // userIds mentioned with @
  createdAt:      Date;
  updatedAt:      Date;
}

export interface NoteDocument extends Omit<INote, 'id'>, Document {}

const NoteSchema = new Schema<NoteDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    leadId:         { type: String, default: null, index: true },
    contactId:      { type: String, default: null },
    companyId:      { type: String, default: null },
    authorId:       { type: String, required: true },
    content:        { type: String, required: true },
    isPinned:       { type: Boolean, default: false },
    isAIGenerated:  { type: Boolean, default: false },
    mentionedUsers: { type: [String], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; },
    },
  }
);

NoteSchema.index({ organizationId: 1, leadId: 1, isPinned: -1, createdAt: -1 });
NoteSchema.index({ organizationId: 1, createdAt: -1 });

export const NoteModel = model<NoteDocument>('Note', NoteSchema);
