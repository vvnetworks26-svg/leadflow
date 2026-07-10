/**
 * aiController.ts
 *
 * Handles all AI engine endpoints.
 * Each request is organization-scoped via req.organizationId (from JWT)
 * or via the widget token for unauthenticated widget conversations.
 *
 * Endpoints:
 *   POST /ai/chat           — main conversation turn
 *   POST /ai/intent         — standalone intent classification
 *   POST /ai/qualify        — standalone qualification scoring
 *   GET  /ai/recommendations — get recommendations for current session
 *   POST /ai/summary        — generate/retrieve conversation summary
 *   GET  /ai/analytics      — org-scoped AI performance stats
 */

import { Request, Response, NextFunction } from 'express';
import { runOrchestrator }              from '../ai/orchestrator';
import { classifyIntent }               from '../ai/intent';
import { qualifyLead }                  from '../ai/qualification';
import { generateRecommendations }      from '../ai/recommendation';
import { buildSummary }                 from '../ai/summarizer';
import { getAIStats }                   from '../ai/analytics';
import { emptyMemory }                  from '../ai/types';
import { AIConversationSessionModel }   from '../models/AIConversationSession.model';
import { ApiError }                     from '../middleware/errorHandler';
import { param }                        from '../utils/params';
import type { ConversationStage }       from '../ai/types';

// ─── Session helpers ──────────────────────────────────────────────────────────

const MAX_HISTORY = 30;   // max turns kept in memory

async function getOrCreateSession(organizationId: string, conversationId: string) {
  let session = await AIConversationSessionModel.findOne({ conversationId, organizationId });
  if (!session) {
    session = await AIConversationSessionModel.create({
      organizationId,
      conversationId,
      stage:        'greeting' as ConversationStage,
      memory:       emptyMemory(),
      history:      [],
      qualification:null,
      turnCount:    0,
      lastActivity: new Date(),
    });
  }
  return session;
}

// ─── POST /api/v1/ai/chat ─────────────────────────────────────────────────────

export async function chat(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, conversationId, currentPage } = req.body as {
      message:        string;
      conversationId: string;
      currentPage?:   string;
    };

    if (!message || !message.trim()) {
      throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');
    }
    if (!conversationId) {
      throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');
    }

    const organizationId = req.organizationId!;
    const session        = await getOrCreateSession(organizationId, conversationId);

    // Run the orchestrator
    const output = await runOrchestrator({
      organizationId,
      conversationId,
      userMessage:  message.trim(),
      history:      session.history,
      memory:       session.memory as any ?? emptyMemory(),
      stage:        (session.stage as ConversationStage) ?? 'greeting',
      currentPage,
    });

    // Update session — cap history at MAX_HISTORY turns
    const newHistory = [
      ...session.history,
      { role: 'user' as const,      content: message },
      { role: 'assistant' as const, content: output.reply },
    ].slice(-MAX_HISTORY);

    await AIConversationSessionModel.findByIdAndUpdate(session._id, {
      stage:        output.updatedStage,
      memory:       output.updatedMemory,
      history:      newHistory,
      qualification:output.qualification,
      turnCount:    session.turnCount + 1,
      lastActivity: new Date(),
    });

    res.json({
      status: 'ok',
      data: {
        reply:           output.reply,
        stage:           output.updatedStage,
        intent:          output.intent,
        qualification:   {
          score:       output.qualification.overall,
          temperature: output.qualification.temperature,
          confidence:  output.qualification.confidence,
        },
        recommendations: output.recommendations.slice(0, 2),
        bookingTriggered:output.bookingTriggered,
        toolsUsed:       output.toolsUsed.map(t => ({ tool: t.tool, success: t.success })),
      },
    });
  } catch (e) { next(e); }
}

// ─── POST /api/v1/ai/intent ───────────────────────────────────────────────────

export async function detectIntent(req: Request, res: Response, next: NextFunction) {
  try {
    const { message } = req.body as { message: string };
    if (!message) throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');

    const intent = classifyIntent(message);
    res.json({ status: 'ok', data: intent });
  } catch (e) { next(e); }
}

// ─── POST /api/v1/ai/qualify ──────────────────────────────────────────────────

export async function qualify(req: Request, res: Response, next: NextFunction) {
  try {
    const { conversationId, memoryOverride } = req.body as {
      conversationId: string;
      memoryOverride?: Record<string, unknown>;
    };

    if (!conversationId) throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');

    const session = await AIConversationSessionModel.findOne({
      conversationId, organizationId: req.organizationId!,
    });
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

    const memory = memoryOverride
      ? { ...session.memory, ...memoryOverride } as any
      : session.memory as any;

    const score = qualifyLead(memory ?? emptyMemory());
    res.json({ status: 'ok', data: score });
  } catch (e) { next(e); }
}

// ─── GET /api/v1/ai/recommendations/:conversationId ──────────────────────────

export async function getRecommendations(req: Request, res: Response, next: NextFunction) {
  try {
    const conversationId = param(req.params.conversationId);
    const session = await AIConversationSessionModel.findOne({
      conversationId, organizationId: req.organizationId!,
    });
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

    const memory = session.memory as any ?? emptyMemory();
    const score  = qualifyLead(memory);
    const recs   = generateRecommendations(memory, score, 5);

    res.json({ status: 'ok', data: recs });
  } catch (e) { next(e); }
}

// ─── POST /api/v1/ai/summary ──────────────────────────────────────────────────

export async function summarize(req: Request, res: Response, next: NextFunction) {
  try {
    const { conversationId } = req.body as { conversationId: string };
    if (!conversationId) throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');

    const session = await AIConversationSessionModel.findOne({
      conversationId, organizationId: req.organizationId!,
    });
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

    const memory = session.memory as any ?? emptyMemory();
    const score  = qualifyLead(memory);
    const recs   = generateRecommendations(memory, score, 3);
    const summary = buildSummary(memory, score, recs);

    res.json({ status: 'ok', data: summary });
  } catch (e) { next(e); }
}

// ─── GET /api/v1/ai/analytics ─────────────────────────────────────────────────

export async function analytics(req: Request, res: Response, next: NextFunction) {
  try {
    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days

    const stats = await getAIStats(req.organizationId!, since);
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}

// ─── GET /api/v1/ai/session/:conversationId ───────────────────────────────────

export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const conversationId = param(req.params.conversationId);
    const session = await AIConversationSessionModel.findOne({
      conversationId, organizationId: req.organizationId!,
    });
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');

    res.json({
      status: 'ok',
      data: {
        stage:        session.stage,
        memory:       session.memory,
        qualification:session.qualification,
        turnCount:    session.turnCount,
        lastActivity: session.lastActivity,
      },
    });
  } catch (e) { next(e); }
}
