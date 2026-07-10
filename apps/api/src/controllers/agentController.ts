/**
 * agentController.ts — All AI Agent Platform API handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { param }                    from '../utils/params';
import { ApiError }                 from '../middleware/errorHandler';

import { AgentService }             from '../ai-agents/agents/AgentService';
import { AgentOrchestrator }        from '../ai-agents/orchestrator/AgentOrchestrator';
import { KnowledgeService }         from '../ai-agents/knowledge/KnowledgeService';
import { MemoryService }            from '../ai-agents/memory/MemoryService';
import { PromptService }            from '../ai-agents/prompts/PromptService';
import { AgentAnalyticsService }    from '../ai-agents/analytics/AgentAnalyticsService';
import { BUILT_IN_TOOLS }           from '../ai-agents/tools/ToolRegistry';
import { AgentMemoryModel }         from '../models/AgentMemory.model';

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function listAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await AgentService.list(req.organizationId!);
    res.json({ status: 'ok', data: agents });
  } catch (e) { next(e); }
}

export async function getAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const agent = await AgentService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: agent });
  } catch (e) { next(e); }
}

export async function createAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const agent = await AgentService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: agent });
  } catch (e) { next(e); }
}

export async function updateAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const agent = await AgentService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: agent });
  } catch (e) { next(e); }
}

export async function deleteAgent(req: Request, res: Response, next: NextFunction) {
  try {
    await AgentService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function chatWithAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, sessionId, leadId, context } = req.body as {
      message: string; sessionId?: string; leadId?: string; context?: Record<string, unknown>;
    };
    if (!message) throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');

    const output = await AgentOrchestrator.chat({
      organizationId: req.organizationId!,
      agentId:        param(req.params.id),
      message, sessionId, leadId, context,
      userId: req.user!.sub,
    });
    res.json({ status: 'ok', data: output });
  } catch (e) { next(e); }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await AgentService.listSessions(req.organizationId!, param(req.params.id), Number(req.query.page ?? 1), Number(req.query.limit ?? 20));
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await AgentService.getSession(req.organizationId!, param(req.params.sessionId));
    res.json({ status: 'ok', data: session });
  } catch (e) { next(e); }
}

export async function clearAgentMemory(req: Request, res: Response, next: NextFunction) {
  try {
    await AgentService.clearMemory(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', message: 'Memory cleared' });
  } catch (e) { next(e); }
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

export async function listKnowledge(req: Request, res: Response, next: NextFunction) {
  try {
    const docs = await KnowledgeService.list(req.organizationId!);
    res.json({ status: 'ok', data: docs });
  } catch (e) { next(e); }
}

export async function uploadKnowledge(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await KnowledgeService.register(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: doc });
  } catch (e) { next(e); }
}

export async function deleteKnowledge(req: Request, res: Response, next: NextFunction) {
  try {
    await KnowledgeService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function searchKnowledge(req: Request, res: Response, next: NextFunction) {
  try {
    const q    = String(req.query.q ?? '');
    if (!q) throw new ApiError(422, 'q is required', 'VALIDATION_ERROR');
    const results = await KnowledgeService.search(req.organizationId!, q, Number(req.query.topK ?? 5));
    res.json({ status: 'ok', data: results.map(r => ({ content: r.chunk.content, score: r.score, documentId: r.chunk.documentId })) });
  } catch (e) { next(e); }
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export async function listMemory(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = param(req.params.agentId);
    const memories = await AgentMemoryModel.find({ organizationId: req.organizationId!, agentId }).sort({ importance: -1, createdAt: -1 }).limit(50).lean();
    res.json({ status: 'ok', data: memories });
  } catch (e) { next(e); }
}

export async function searchMemory(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = param(req.params.agentId);
    const q = String(req.query.q ?? '');
    if (!q) throw new ApiError(422, 'q is required', 'VALIDATION_ERROR');
    const results = await MemoryService.retrieve(req.organizationId!, agentId, q, 10);
    res.json({ status: 'ok', data: results });
  } catch (e) { next(e); }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export async function listPrompts(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = req.query.agentId as string | undefined;
    const prompts = await PromptService.list(req.organizationId!, agentId);
    res.json({ status: 'ok', data: prompts });
  } catch (e) { next(e); }
}

export async function createPrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const prompt = await PromptService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: prompt });
  } catch (e) { next(e); }
}

export async function updatePrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const prompt = await PromptService.update(req.organizationId!, param(req.params.id), req.user!.sub, req.body);
    res.json({ status: 'ok', data: prompt });
  } catch (e) { next(e); }
}

export async function rollbackPrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const { version } = req.body as { version: number };
    const prompt = await PromptService.rollback(req.organizationId!, param(req.params.id), version);
    res.json({ status: 'ok', data: prompt });
  } catch (e) { next(e); }
}

export async function deletePrompt(req: Request, res: Response, next: NextFunction) {
  try {
    await PromptService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function previewPrompt(req: Request, res: Response, next: NextFunction) {
  try {
    const rendered = await PromptService.render(req.organizationId!, param(req.params.id), req.body ?? {});
    res.json({ status: 'ok', data: { rendered } });
  } catch (e) { next(e); }
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export async function listTools(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ status: 'ok', data: BUILT_IN_TOOLS });
  } catch (e) { next(e); }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAgentAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const agentId = req.query.agentId as string | undefined;
    const since   = req.query.since ? new Date(String(req.query.since)) : undefined;
    const stats   = await AgentAnalyticsService.getStats(req.organizationId!, agentId, since);
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}
