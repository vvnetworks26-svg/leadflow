/**
 * widgetController.ts
 *
 * Public-facing widget endpoints.
 * No authentication required — the widget token (businessId / org slug)
 * identifies the organization. All created records are automatically
 * scoped to that organization.
 *
 * Security: these endpoints are rate-limited and only allow create operations
 * for leads and conversations — no reads, no deletes.
 */

import { Request, Response, NextFunction } from 'express';
import { OrganizationModel } from '../models/Organization.model';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { ApiError } from '../middleware/errorHandler';
import { CreateLeadSchema } from '../dto/lead.dto';
import { CreateConversationSchema } from '../dto/conversation.dto';
import { parseQuery } from '../utils/validate';
import { runOrchestrator } from '../ai/orchestrator';
import { AIConversationSessionModel } from '../models/AIConversationSession.model';
import { emptyMemory } from '../ai/types';
import type { ConversationStage } from '../ai/types';

/** Resolve organizationId from a widget token (org slug or org ID). */
async function resolveOrg(token: string): Promise<string> {
  // Try slug first, then fall back to _id
  const org =
    await OrganizationModel.findOne({ slug: token, status: 'active' }) ??
    await OrganizationModel.findOne({ _id: token,  status: 'active' }).catch(() => null);

  if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');
  return org.id as string;
}

/**
 * GET /api/v1/widget/:token/config
 * Returns the public widget configuration for an organization.
 */
export async function getWidgetConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = await resolveOrg(req.params.token);
    const org   = await OrganizationModel.findById(orgId);
    if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

    res.json({
      status: 'ok',
      data: {
        organizationId: org.id,
        name:           org.name,
        slug:           org.slug,
        industry:       org.industry,
        timezone:       org.timezone,
      },
    });
  } catch (e) { next(e); }
}

/**
 * POST /api/v1/widget/:token/leads
 * Widget creates a lead for an organization.
 * organizationId is resolved from the token — never trusted from the body.
 */
export async function widgetCreateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = CreateLeadSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const orgId = await resolveOrg(req.params.token);
    const lead  = await LeadService.create(orgId, { ...result.data, source: result.data.source || 'widget' });
    res.status(201).json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

/**
 * POST /api/v1/widget/:token/conversations
 * Widget creates a conversation for an organization.
 */
export async function widgetCreateConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = CreateConversationSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ApiError(422, msg, 'VALIDATION_ERROR');
    }

    const orgId        = await resolveOrg(req.params.token);
    const conversation = await ConversationService.create(orgId, result.data);
    res.status(201).json({ status: 'ok', data: conversation });
  } catch (e) { next(e); }
}

const MAX_WIDGET_HISTORY = 30;

/**
 * POST /api/v1/widget/:token/chat
 * Unauthenticated widget conversation turn.
 * The token resolves the organization — no JWT required.
 */
export async function widgetChat(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, conversationId, currentPage } = req.body as {
      message:        string;
      conversationId: string;
      currentPage?:   string;
    };
    if (!message || !message.trim()) throw new ApiError(422, 'message is required', 'VALIDATION_ERROR');
    if (!conversationId)             throw new ApiError(422, 'conversationId is required', 'VALIDATION_ERROR');

    const orgId = await resolveOrg(req.params.token);

    // Load or create session
    let session = await AIConversationSessionModel.findOne({ conversationId, organizationId: orgId });
    if (!session) {
      session = await AIConversationSessionModel.create({
        organizationId: orgId,
        conversationId,
        stage:          'greeting' as ConversationStage,
        memory:         emptyMemory(),
        history:        [],
        qualification:  null,
        turnCount:      0,
        lastActivity:   new Date(),
      });
    }

    const output = await runOrchestrator({
      organizationId: orgId,
      conversationId,
      userMessage:    message.trim(),
      history:        session.history,
      memory:         session.memory as any ?? emptyMemory(),
      stage:          (session.stage as ConversationStage) ?? 'greeting',
      currentPage,
    });

    const newHistory = [
      ...session.history,
      { role: 'user' as const,      content: message },
      { role: 'assistant' as const, content: output.reply },
    ].slice(-MAX_WIDGET_HISTORY);

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
        bookingTriggered:output.bookingTriggered,
      },
    });
  } catch (e) { next(e); }
}
