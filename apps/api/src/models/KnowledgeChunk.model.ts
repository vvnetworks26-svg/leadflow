/**
 * KnowledgeChunk.model.ts — A text chunk from a KnowledgeDocument with embedding.
 */

import { Schema, model, Document } from 'mongoose';

export interface IKnowledgeChunk {
  id:             string;
  organizationId: string;
  documentId:     string;
  chunkIndex:     number;
  content:        string;
  summary:        string;
  embedding:      number[];     // vector embedding (stored inline for small collections)
  embeddingModel: string;
  tokenCount:     number;
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

export interface KnowledgeChunkDocument extends Omit<IKnowledgeChunk, 'id'>, Document {}

const KnowledgeChunkSchema = new Schema<KnowledgeChunkDocument>(
  {
    organizationId: { type: String, required: true, index: true },
    documentId:     { type: String, required: true, index: true },
    chunkIndex:     { type: Number, required: true },
    content:        { type: String, required: true },
    summary:        { type: String, default: '' },
    embedding:      { type: [Number], default: [] },
    embeddingModel: { type: String, default: 'gemini' },
    tokenCount:     { type: Number, default: 0 },
    metadata:       { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, versionKey: false,
    toJSON: { virtuals: true, transform: (_doc, ret) => { ret.id = ret._id.toString(); delete (ret as any)._id; return ret; } },
  }
);

KnowledgeChunkSchema.index({ organizationId: 1, documentId: 1, chunkIndex: 1 });
KnowledgeChunkSchema.index({ content: 'text', summary: 'text' }, { name: 'chunk_text_search' });

export const KnowledgeChunkModel = model<KnowledgeChunkDocument>('KnowledgeChunk', KnowledgeChunkSchema);
