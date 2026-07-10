/**
 * KnowledgeDocument.model.ts — Source document uploaded to a knowledge base.
 */

import { Schema, model, Document } from 'mongoose';

export type KnowledgeDocType = 'pdf' | 'docx' | 'txt' | 'markdown' | 'csv' | 'faq' | 'url' | 'custom';

export interface IKnowledgeDocument {
  id:             string;
  organizationId: string;
  agentIds:       string[];     // which agents use this KB
  name:           string;
  type:           KnowledgeDocType;
  category:       string;
  url:            string;       // storage URL
  sizeBytes:      number;
  chunkCount:     number;
  isProcessed:    boolean;
  processingError:string | null;
  version:        number;
  metadata:       Record<string, unknown>;
  deletedAt:      Date | null;
  createdById:    string;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface KnowledgeDocumentDocument extends Omit<IKnowledgeDocument, 'id'>, Document {}

const KnowledgeDocumentSchema = new Schema<KnowledgeDocumentDocument>(
  {
    organizationId:  { type: String, required: true, index: true },
    agentIds:        { type: [String], default: [] },
    name:            { type: String, required: true },
    type:            { type: String, enum: ['pdf','docx','txt','markdown','csv','faq','url','custom'], default: 'txt' },
    category:        { type: String, default: 'General' },
    url:             { type: String, default: '' },
    sizeBytes:       { type: Number, default: 0 },
    chunkCount:      { type: Number, default: 0 },
    isProcessed:     { type: Boolean, default: false },
    processingError: { type: String, default: null },
    version:         { type: Number, default: 1 },
    metadata:        { type: Schema.Types.Mixed, default: {} },
    deletedAt:       { type: Date, default: null },
    createdById:     { type: String, required: true },
  },
  {
    timestamps: true, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

KnowledgeDocumentSchema.index({ organizationId: 1, category: 1 });
KnowledgeDocumentSchema.index({ organizationId: 1, isProcessed: 1 });

export const KnowledgeDocumentModel = model<KnowledgeDocumentDocument>('KnowledgeDocument', KnowledgeDocumentSchema);
