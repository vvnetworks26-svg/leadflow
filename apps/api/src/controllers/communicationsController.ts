/**
 * communicationsController.ts
 *
 * All omnichannel communications API handlers.
 * Every route reads organizationId from req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { param }                    from '../utils/params';
import { ApiError }                 from '../middleware/errorHandler';
import { z }                        from 'zod';
import { parseQuery }               from '../utils/validate';

import { InboxService }             from '../communications/inbox/InboxService';
import { MessageService }           from '../communications/inbox/MessageService';
import { CampaignService }          from '../communications/campaigns/CampaignService';
import { TemplateEngine }           from '../communications/templates/TemplateEngine';
import { AttachmentService }        from '../communications/attachments/AttachmentService';
import { AiCommunicationService }   from '../communications/ai/AiCommunicationService';
import { ChannelAccountModel }      from '../models/ChannelAccount.model';
import { InboxRuleModel }           from '../models/InboxRule.model';
import { CommunicationMessageModel }from '../models/CommunicationMessage.model';

// ─── Inbox / Threads ──────────────────────────────────────────────────────────

const InboxQuerySchema = z.object({
  status:     z.enum(['open','resolved','archived','spam','pending']).optional(),
  assigneeId: z.string().optional(),
  channel:    z.string().optional(),
  label:      z.string().optional(),
  search:     z.string().optional(),
  unread:     z.coerce.boolean().optional(),
  pinned:     z.coerce.boolean().optional(),
  starred:    z.coerce.boolean().optional(),
  page:       z.coerce.number().int().min(1).optional(),
  limit:      z.coerce.number().int().min(1).max(100).optional(),
});

export async function listThreads(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(InboxQuerySchema, req.query);
    const result = await InboxService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getThread(req: Request, res: Response, next: NextFunction) {
  try {
    const thread = await InboxService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function createThread(req: Request, res: Response, next: NextFunction) {
  try {
    const thread = await InboxService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function assignThread(req: Request, res: Response, next: NextFunction) {
  try {
    const { assigneeId } = req.body as { assigneeId: string | null };
    const thread = await InboxService.assign(req.organizationId!, param(req.params.id), assigneeId ?? null, req.user!.sub);
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function updateThreadStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body as { status: any };
    const thread = await InboxService.updateStatus(req.organizationId!, param(req.params.id), status, req.user!.sub);
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function addLabel(req: Request, res: Response, next: NextFunction) {
  try {
    const { label } = req.body as { label: string };
    if (!label) throw new ApiError(422, 'label required', 'VALIDATION_ERROR');
    const thread = await InboxService.addLabel(req.organizationId!, param(req.params.id), label);
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function removeLabel(req: Request, res: Response, next: NextFunction) {
  try {
    const thread = await InboxService.removeLabel(req.organizationId!, param(req.params.id), param(req.params.label));
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function pinThread(req: Request, res: Response, next: NextFunction) {
  try {
    const { pinned } = req.body as { pinned: boolean };
    const thread = await InboxService.togglePin(req.organizationId!, param(req.params.id), pinned ?? true);
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function starThread(req: Request, res: Response, next: NextFunction) {
  try {
    const { starred } = req.body as { starred: boolean };
    const thread = await InboxService.toggleStar(req.organizationId!, param(req.params.id), starred ?? true);
    res.json({ status: 'ok', data: thread });
  } catch (e) { next(e); }
}

export async function deleteThread(req: Request, res: Response, next: NextFunction) {
  try {
    await InboxService.softDelete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function getThreadTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Number(req.query.page  ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const result = await InboxService.getTimeline(req.organizationId!, param(req.params.id), page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function markThreadRead(req: Request, res: Response, next: NextFunction) {
  try {
    await InboxService.markRead(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { threadId, ...rest } = req.body;
    if (!threadId) throw new ApiError(422, 'threadId required', 'VALIDATION_ERROR');
    const msg = await MessageService.send({
      ...rest,
      organizationId: req.organizationId!,
      threadId,
      direction:      'outbound',
      senderId:       req.user!.sub,
    });
    res.status(201).json({ status: 'ok', data: msg });
  } catch (e) { next(e); }
}

export async function getMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const msg = await MessageService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: msg });
  } catch (e) { next(e); }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await MessageService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = req.query.channel as any;
    const tmpls   = await TemplateEngine.list(req.organizationId!, channel);
    res.json({ status: 'ok', data: tmpls });
  } catch (e) { next(e); }
}

export async function getTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const tmpl = await TemplateEngine.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: tmpl });
  } catch (e) { next(e); }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const tmpl = await TemplateEngine.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: tmpl });
  } catch (e) { next(e); }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const tmpl = await TemplateEngine.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: tmpl });
  } catch (e) { next(e); }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    await TemplateEngine.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function previewTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const rendered = await TemplateEngine.render(req.organizationId!, param(req.params.id), req.body ?? {});
    res.json({ status: 'ok', data: rendered });
  } catch (e) { next(e); }
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function listCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await CampaignService.list(req.organizationId!, Number(req.query.page ?? 1), Number(req.query.limit ?? 20));
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const campaign = await CampaignService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: campaign });
  } catch (e) { next(e); }
}

export async function createCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const campaign = await CampaignService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: campaign });
  } catch (e) { next(e); }
}

export async function updateCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const campaign = await CampaignService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: campaign });
  } catch (e) { next(e); }
}

export async function sendCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const campaign = await CampaignService.send(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: campaign });
  } catch (e) { next(e); }
}

export async function pauseCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const campaign = await CampaignService.pause(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: campaign });
  } catch (e) { next(e); }
}

export async function deleteCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    await CampaignService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function listAttachments(req: Request, res: Response, next: NextFunction) {
  try {
    const attachments = await AttachmentService.listForThread(req.organizationId!, param(req.params.threadId));
    res.json({ status: 'ok', data: attachments });
  } catch (e) { next(e); }
}

export async function registerAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const { messageId, threadId, ...data } = req.body;
    if (!messageId || !threadId) throw new ApiError(422, 'messageId and threadId required', 'VALIDATION_ERROR');
    const attachment = await AttachmentService.register(req.organizationId!, messageId, threadId, data);
    res.status(201).json({ status: 'ok', data: attachment });
  } catch (e) { next(e); }
}

// ─── AI Features ──────────────────────────────────────────────────────────────

export async function analyzeThread(req: Request, res: Response, next: NextFunction) {
  try {
    const analysis = await AiCommunicationService.analyzeThread(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: analysis });
  } catch (e) { next(e); }
}

export async function suggestReply(req: Request, res: Response, next: NextFunction) {
  try {
    const reply = await AiCommunicationService.suggestReply(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: { reply } });
  } catch (e) { next(e); }
}

// ─── Channel Accounts ─────────────────────────────────────────────────────────

export async function listChannelAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const docs = await ChannelAccountModel.find({ organizationId: req.organizationId! }).lean();
    res.json({ status: 'ok', data: docs });
  } catch (e) { next(e); }
}

export async function createChannelAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await ChannelAccountModel.create({ ...req.body, organizationId: req.organizationId! });
    res.status(201).json({ status: 'ok', data: doc.toJSON() });
  } catch (e) { next(e); }
}

export async function updateChannelAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await ChannelAccountModel.findOneAndUpdate(
      { _id: param(req.params.id), organizationId: req.organizationId! }, req.body, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Account not found', 'NOT_FOUND');
    res.json({ status: 'ok', data: doc.toJSON() });
  } catch (e) { next(e); }
}

export async function deleteChannelAccount(req: Request, res: Response, next: NextFunction) {
  try {
    await ChannelAccountModel.findOneAndDelete({ _id: param(req.params.id), organizationId: req.organizationId! });
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Inbox Rules ──────────────────────────────────────────────────────────────

export async function listInboxRules(req: Request, res: Response, next: NextFunction) {
  try {
    const rules = await InboxRuleModel.find({ organizationId: req.organizationId! }).sort({ priority: -1 }).lean();
    res.json({ status: 'ok', data: rules });
  } catch (e) { next(e); }
}

export async function createInboxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await InboxRuleModel.create({ ...req.body, organizationId: req.organizationId! });
    res.status(201).json({ status: 'ok', data: doc.toJSON() });
  } catch (e) { next(e); }
}

export async function updateInboxRule(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await InboxRuleModel.findOneAndUpdate(
      { _id: param(req.params.id), organizationId: req.organizationId! }, req.body, { new: true }
    );
    if (!doc) throw new ApiError(404, 'Rule not found', 'NOT_FOUND');
    res.json({ status: 'ok', data: doc.toJSON() });
  } catch (e) { next(e); }
}

export async function deleteInboxRule(req: Request, res: Response, next: NextFunction) {
  try {
    await InboxRuleModel.findOneAndDelete({ _id: param(req.params.id), organizationId: req.organizationId! });
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Global Search ────────────────────────────────────────────────────────────

export async function searchMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const q     = String(req.query.q ?? '');
    const limit = Number(req.query.limit ?? 20);
    if (!q) { res.json({ status: 'ok', data: [] }); return; }
    const re   = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const msgs = await CommunicationMessageModel.find({
      organizationId: req.organizationId!,
      $or: [{ body: re }, { subject: re }, { fromAddress: re }],
    }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ status: 'ok', data: msgs });
  } catch (e) { next(e); }
}

// ─── Webhook inbound (public, per channel) ────────────────────────────────────

export async function handleInboundWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const channel = param(req.params.channel) as any;
    const orgId   = String(req.query.orgId ?? '');
    if (!orgId) { res.status(400).json({ error: 'orgId required' }); return; }

    const { getProvider } = require('../communications/providers/ProviderRegistry');
    const provider = await getProvider(orgId, channel);
    if (!provider) { res.status(404).json({ error: 'no provider' }); return; }

    const signature = String(req.headers['x-leadflow-signature'] ?? req.headers['x-hub-signature-256'] ?? '');
    const parsed    = await provider.parseInbound(req.body);
    if (!parsed)    { res.json({ status: 'ok' }); return; }

    await MessageService.receiveInbound(orgId, channel, parsed.from, parsed.body, parsed.externalId, parsed.metadata);
    res.json({ status: 'ok' });
  } catch (e) { next(e); }
}
