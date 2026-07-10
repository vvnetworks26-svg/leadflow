/**
 * KnowledgeService.ts
 *
 * Manages the knowledge base: document ingestion, chunking, embedding,
 * and semantic retrieval. All operations are organization-scoped.
 */

import { KnowledgeDocumentModel, IKnowledgeDocument } from '../../models/KnowledgeDocument.model';
import { KnowledgeChunkModel, IKnowledgeChunk }       from '../../models/KnowledgeChunk.model';
import { embedWithCache, cosineSimilarity }            from '../embeddings/EmbeddingService';
import { ApiError }                                    from '../../middleware/errorHandler';
import { logger }                                      from '../../utils/logger';

const CHUNK_SIZE     = 500;    // characters per chunk
const CHUNK_OVERLAP  = 50;     // overlap between chunks

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end   = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter(c => c.length > 20);
}

export const KnowledgeService = {

  async list(organizationId: string): Promise<IKnowledgeDocument[]> {
    const docs = await KnowledgeDocumentModel.find({ organizationId, deletedAt: null }).sort({ createdAt: -1 });
    return docs.map(d => d.toJSON() as unknown as IKnowledgeDocument);
  },

  async getById(organizationId: string, id: string): Promise<IKnowledgeDocument> {
    const doc = await KnowledgeDocumentModel.findOne({ _id: id, organizationId, deletedAt: null });
    if (!doc) throw new ApiError(404, 'Document not found', 'DOCUMENT_NOT_FOUND');
    return doc.toJSON() as unknown as IKnowledgeDocument;
  },

  /** Register a document and trigger async processing. */
  async register(
    organizationId: string,
    userId:         string,
    data: {
      name:      string;
      type:      IKnowledgeDocument['type'];
      category?: string;
      url?:      string;
      content?:  string;     // direct text content for txt/markdown/faq
      agentIds?: string[];
    }
  ): Promise<IKnowledgeDocument> {
    const doc = await KnowledgeDocumentModel.create({
      organizationId,
      name:      data.name,
      type:      data.type,
      category:  data.category ?? 'General',
      url:       data.url ?? '',
      agentIds:  data.agentIds ?? [],
      isProcessed: false,
      createdById: userId,
    });

    // Process async — don't block the registration response
    if (data.content) {
      KnowledgeService._processContent(organizationId, doc._id.toString(), data.content)
        .catch(err => logger.warn({ err, docId: doc._id }, '[Knowledge] processing failed'));
    }

    return doc.toJSON() as unknown as IKnowledgeDocument;
  },

  /** Process raw text content: chunk → embed → store. */
  async _processContent(organizationId: string, documentId: string, content: string): Promise<void> {
    try {
      const chunks = chunkText(content);

      // Embed all chunks
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embedWithCache(chunks[i]);
        await KnowledgeChunkModel.create({
          organizationId,
          documentId,
          chunkIndex:  i,
          content:     chunks[i],
          embedding,
          tokenCount:  Math.ceil(chunks[i].length / 4),
        });
      }

      await KnowledgeDocumentModel.findByIdAndUpdate(documentId, {
        isProcessed: true,
        chunkCount:  chunks.length,
        sizeBytes:   content.length,
      });
    } catch (err) {
      await KnowledgeDocumentModel.findByIdAndUpdate(documentId, {
        isProcessed:    false,
        processingError:String(err),
      });
    }
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await KnowledgeDocumentModel.findOneAndUpdate({ _id: id, organizationId }, { deletedAt: new Date() });
    await KnowledgeChunkModel.deleteMany({ organizationId, documentId: id });
  },

  /**
   * Semantic search across knowledge chunks.
   * Returns top-K most similar chunks using cosine similarity.
   * Falls back to text search when embeddings unavailable.
   */
  async search(
    organizationId: string,
    query:          string,
    topK           = 5,
    documentIds?:  string[],
  ): Promise<Array<{ chunk: IKnowledgeChunk; score: number }>> {
    const queryVec = await embedWithCache(query);

    // Load relevant chunks
    const filter: Record<string, unknown> = { organizationId };
    if (documentIds?.length) filter.documentId = { $in: documentIds };

    const chunks = await KnowledgeChunkModel.find(filter).lean();

    if (chunks.length === 0) {
      // Fallback: text search
      const re      = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const textHits = await KnowledgeChunkModel.find({ organizationId, content: re, ...( documentIds?.length ? { documentId: { $in: documentIds } } : {} ) }).limit(topK).lean();
      return textHits.map(c => ({ chunk: c as unknown as IKnowledgeChunk, score: 0.5 }));
    }

    // Score by cosine similarity
    const scored = chunks
      .filter(c => c.embedding?.length > 0)
      .map(c => ({ chunk: c as unknown as IKnowledgeChunk, score: cosineSimilarity(queryVec, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // If no embeddings, fall back to text search results
    if (scored.length === 0) {
      const re      = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const textHits = await KnowledgeChunkModel.find({ organizationId, content: re }).limit(topK).lean();
      return textHits.map(c => ({ chunk: c as unknown as IKnowledgeChunk, score: 0.5 }));
    }

    return scored;
  },

  /** Format search results for prompt injection. */
  formatForPrompt(results: Array<{ chunk: IKnowledgeChunk; score: number }>): string {
    if (results.length === 0) return '';
    return '[KNOWLEDGE BASE]\n' +
      results.map(r => `• (score: ${r.score.toFixed(2)}) ${r.chunk.content}`).join('\n') +
      '\n[/KNOWLEDGE BASE]';
  },
};
