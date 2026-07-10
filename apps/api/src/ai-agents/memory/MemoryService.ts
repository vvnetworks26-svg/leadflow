/**
 * MemoryService.ts
 *
 * Agent memory management: store, retrieve, summarize, and prune.
 * Short-term: cleared after session. Long-term: persisted indefinitely.
 * Semantic retrieval using text search + importance weighting.
 */

import { AgentMemoryModel, IAgentMemory, MemoryType } from '../../models/AgentMemory.model';
import { sendToGemini, isGeminiConfigured }           from '../../ai/gemini';

export const MemoryService = {

  /** Store a new memory entry. */
  async store(
    organizationId: string,
    agentId:        string,
    data: {
      key:         string;
      content:     string;
      type?:       MemoryType;
      sessionId?:  string;
      leadId?:     string;
      importance?: number;
      expiresAt?:  Date;
      metadata?:   Record<string, unknown>;
    }
  ): Promise<IAgentMemory> {
    const doc = await AgentMemoryModel.findOneAndUpdate(
      { organizationId, agentId, key: data.key },
      {
        $set: {
          organizationId, agentId,
          key:        data.key,
          content:    data.content,
          type:       data.type       ?? 'short_term',
          sessionId:  data.sessionId  ?? null,
          leadId:     data.leadId     ?? null,
          importance: data.importance ?? 5,
          expiresAt:  data.expiresAt  ?? null,
          metadata:   data.metadata   ?? {},
        },
        $inc: { accessCount: 0 },
      },
      { upsert: true, new: true }
    );
    return doc.toJSON() as unknown as IAgentMemory;
  },

  /** Retrieve memories by text search + importance sort. */
  async retrieve(
    organizationId: string,
    agentId:        string,
    query:          string,
    topK           = 5,
    types?:         MemoryType[],
    leadId?:        string,
  ): Promise<IAgentMemory[]> {
    const filter: Record<string, unknown> = {
      organizationId, agentId,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (types?.length) filter.type = { $in: types };
    if (leadId)        filter.leadId = leadId;

    // Text search first
    const re   = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const hits = await AgentMemoryModel.find({
      ...filter,
      $or: [{ content: re }, { key: re }, { summary: re }],
    }).sort({ importance: -1, accessCount: -1 }).limit(topK).lean();

    // Update access counts
    if (hits.length > 0) {
      const ids = hits.map(h => h._id);
      await AgentMemoryModel.updateMany(
        { _id: { $in: ids } },
        { $inc: { accessCount: 1 }, lastAccessedAt: new Date() }
      );
    }

    return hits as unknown as IAgentMemory[];
  },

  /** Format memory for prompt injection. */
  formatForPrompt(memories: IAgentMemory[]): string {
    if (memories.length === 0) return '';
    return '[AGENT MEMORY]\n' +
      memories.map(m => `• [${m.type}] ${m.key}: ${m.content}`).join('\n') +
      '\n[/AGENT MEMORY]';
  },

  /** Summarize and consolidate short-term memories into long-term. */
  async consolidate(organizationId: string, agentId: string, sessionId: string): Promise<void> {
    const shortTerm = await AgentMemoryModel.find({
      organizationId, agentId, sessionId, type: 'short_term',
    }).lean();

    if (shortTerm.length < 3) return;

    const text = shortTerm.map(m => `${m.key}: ${m.content}`).join('\n');

    let summary = text.slice(0, 300);
    if (isGeminiConfigured()) {
      const r = await sendToGemini({
        systemPrompt:   'Summarize these agent memory entries concisely in 2-3 sentences.',
        knowledgeBlock: '',
        history:        [],
        userMessage:    text,
        maxTokens:      200,
      });
      if (r.success) summary = r.text;
    }

    await MemoryService.store(organizationId, agentId, {
      key:        `session_summary_${sessionId}`,
      content:    summary,
      type:       'long_term',
      sessionId,
      importance: 7,
    });

    // Clear short-term
    await AgentMemoryModel.deleteMany({ organizationId, agentId, sessionId, type: 'short_term' });
  },

  /** Prune low-importance expired memories. */
  async prune(organizationId: string, agentId: string): Promise<number> {
    const result = await AgentMemoryModel.deleteMany({
      organizationId, agentId, importance: { $lt: 3 },
      accessCount: 0,
    });
    return result.deletedCount;
  },

  async clearSession(organizationId: string, agentId: string, sessionId: string): Promise<void> {
    await AgentMemoryModel.deleteMany({ organizationId, agentId, sessionId, type: 'short_term' });
  },
};
