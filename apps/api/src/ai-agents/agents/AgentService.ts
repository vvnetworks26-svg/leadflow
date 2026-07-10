/**
 * AgentService.ts — Agent definition CRUD + default seeding.
 */

import { AgentModel, IAgent }   from '../../models/Agent.model';
import { AgentSessionModel }    from '../../models/AgentSession.model';
import { AgentMemoryModel }     from '../../models/AgentMemory.model';
import { ApiError }             from '../../middleware/errorHandler';
import { BUILT_IN_TOOLS }       from '../tools/ToolRegistry';
import { PaginatedResult, paginated } from '../../utils/query';

export const AgentService = {

  async list(organizationId: string): Promise<IAgent[]> {
    const docs = await AgentModel.find({ organizationId, deletedAt: null }).sort({ name: 1 });
    return docs.map(d => d.toJSON() as unknown as IAgent);
  },

  async getById(organizationId: string, id: string): Promise<IAgent> {
    const doc = await AgentModel.findOne({ _id: id, organizationId, deletedAt: null });
    if (!doc) throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
    return doc.toJSON() as unknown as IAgent;
  },

  async create(organizationId: string, userId: string, data: Partial<IAgent>): Promise<IAgent> {
    // Default tools: all built-ins enabled
    const defaultTools = BUILT_IN_TOOLS.map(t => ({ name: t.name, enabled: true, permissions: [] }));
    const doc = await AgentModel.create({
      ...data,
      organizationId,
      createdById: userId,
      tools: data.tools ?? defaultTools,
    });
    return doc.toJSON() as unknown as IAgent;
  },

  async update(organizationId: string, id: string, data: Partial<IAgent>): Promise<IAgent> {
    const doc = await AgentModel.findOneAndUpdate(
      { _id: id, organizationId, deletedAt: null }, data, { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
    return doc.toJSON() as unknown as IAgent;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await AgentModel.findOneAndUpdate({ _id: id, organizationId }, { deletedAt: new Date() });
  },

  async listSessions(organizationId: string, agentId: string, page = 1, limit = 20): Promise<PaginatedResult<any>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId, agentId, deletedAt: null };
    const [docs, total] = await Promise.all([
      AgentSessionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AgentSessionModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON()), total, { page, limit, skip });
  },

  async getSession(organizationId: string, sessionId: string): Promise<any> {
    const doc = await AgentSessionModel.findOne({ _id: sessionId, organizationId });
    if (!doc) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    return doc.toJSON();
  },

  async clearMemory(organizationId: string, agentId: string): Promise<void> {
    await AgentMemoryModel.deleteMany({ organizationId, agentId, type: { $in: ['short_term','conversation'] } });
  },

  /** Seed default agents for a new organization. */
  async seedDefaults(organizationId: string, userId: string): Promise<void> {
    const existing = await AgentModel.countDocuments({ organizationId, deletedAt: null });
    if (existing > 0) return;

    const defaults = [
      { name: 'Sales Agent',    role: 'sales' as const,     description: 'Qualifies leads, manages pipeline, and drives bookings', systemPrompt: 'You are an expert AI Sales Development Representative. Your goal is to qualify leads, understand their pain points, and guide them toward booking a meeting.' },
      { name: 'Support Agent',  role: 'support' as const,   description: 'Answers questions and resolves issues using the knowledge base', systemPrompt: 'You are a helpful support agent. Use the knowledge base to answer questions accurately. Escalate to a human if you cannot resolve the issue.' },
      { name: 'Booking Agent',  role: 'booking' as const,   description: 'Schedules meetings and manages calendar', systemPrompt: 'You are a scheduling assistant. Help users book meetings by checking availability and confirming appointments.' },
    ];

    for (const d of defaults) {
      await AgentService.create(organizationId, userId, d).catch(() => {});
    }
  },
};
