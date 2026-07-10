/**
 * ActionExecutor.ts
 *
 * Executes a single workflow action step.
 * Each action is a pure async function that receives params + context
 * and returns an output record.
 * All side-effectful actions (DB writes, AI calls, HTTP) are here.
 */

import type { WorkflowStep, ExecutionContext, ActionType } from '../types';
import { interpolateParams }    from '../variables/VariableResolver';
import { LeadModel }            from '../../models/Lead.model';
import { TaskModel }            from '../../models/Task.model';
import { NoteModel }            from '../../models/Note.model';
import { NotificationModel }    from '../../models/Notification.model';
import { TagModel }             from '../../models/Tag.model';
import { BookingModel }         from '../../models/Booking.model';
import { ActivityService }      from '../../crm/activities/ActivityService';
import { runOrchestrator }      from '../../ai/orchestrator';
import { emptyMemory }          from '../../ai/types';
import { logger }               from '../../utils/logger';

export interface ActionResult {
  success: boolean;
  output:  Record<string, unknown>;
  error?:  string;
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function createLead(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  try {
    const doc = await LeadModel.create({
      organizationId: ctx.organizationId,
      name:           String(params.name    ?? 'Unknown'),
      phone:          String(params.phone   ?? ''),
      email:          String(params.email   ?? ''),
      hvacNeed:       String(params.hvacNeed ?? 'General inquiry'),
      source:         String(params.source  ?? 'automation'),
    });
    return { success: true, output: { leadId: doc.id, lead: doc.toJSON() } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function updateLead(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? (ctx.triggerData as any)?.leadId ?? '');
  if (!leadId) return { success: false, output: {}, error: 'leadId required' };
  try {
    const { leadId: _id, ...patch } = params;
    const doc = await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId: ctx.organizationId },
      { $set: patch },
      { new: true }
    );
    return { success: !!doc, output: { lead: doc?.toJSON() ?? {} } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function assignOwner(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
  const ownerId = String(params.ownerId ?? '');
  if (!leadId || !ownerId) return { success: false, output: {}, error: 'leadId and ownerId required' };
  try {
    await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId: ctx.organizationId },
      { ownerId }
    );
    return { success: true, output: { leadId, ownerId } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function movePipelineStage(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
  if (!leadId) return { success: false, output: {}, error: 'leadId required' };
  try {
    const doc = await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId: ctx.organizationId },
      { $set: { stageId: params.stageId, stageName: params.stageName, pipelineId: params.pipelineId } },
      { new: true }
    );
    ActivityService.log({
      organizationId: ctx.organizationId,
      type:           'stage_changed',
      title:          `Stage moved to ${params.stageName} via automation`,
      leadId,
      metadata:       { workflowId: ctx.workflowId, executionId: ctx.executionId },
    }).catch(() => {});
    return { success: !!doc, output: { leadId, stageName: params.stageName } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function createTask(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  try {
    const doc = await TaskModel.create({
      organizationId: ctx.organizationId,
      title:          String(params.title   ?? 'Follow up'),
      type:           String(params.type    ?? 'Follow-up'),
      priority:       String(params.priority ?? 'Medium'),
      leadId:         params.leadId ?? (ctx.triggerData as any)?.id ?? null,
      ownerId:        params.ownerId ?? null,
      dueDate:        params.dueDaysFromNow
        ? new Date(Date.now() + Number(params.dueDaysFromNow) * 86400_000)
        : (params.dueDate ? new Date(String(params.dueDate)) : null),
      description:    String(params.description ?? ''),
    });
    return { success: true, output: { taskId: doc.id } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function completeTask(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const taskId = String(params.taskId ?? '');
  if (!taskId) return { success: false, output: {}, error: 'taskId required' };
  try {
    await TaskModel.findOneAndUpdate(
      { _id: taskId, organizationId: ctx.organizationId },
      { completed: true, completedAt: new Date() }
    );
    return { success: true, output: { taskId } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function createNote(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  try {
    const doc = await NoteModel.create({
      organizationId: ctx.organizationId,
      content:        String(params.content ?? ''),
      leadId:         params.leadId ?? (ctx.triggerData as any)?.id ?? null,
      authorId:       ctx.triggerData.userId ?? 'system',
      isAIGenerated:  params.isAIGenerated ?? false,
    });
    return { success: true, output: { noteId: doc.id } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function sendEmail(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  // Email sending hook — in production wire to SendGrid/Resend/SES
  // The params contain: to, subject, body (interpolated before this point)
  logger.info({ to: params.to, subject: params.subject }, '[Automation] sendEmail (hook — configure SMTP)');
  return { success: true, output: { sent: true, to: params.to, subject: params.subject } };
}

async function sendSms(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  // SMS hook — future-ready. Wire to Twilio/MessageBird in production.
  logger.info({ to: params.to }, '[Automation] sendSms (hook — configure SMS provider)');
  return { success: true, output: { sent: true, to: params.to } };
}

async function notifyUser(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const userId = String(params.userId ?? '');
  if (!userId) return { success: false, output: {}, error: 'userId required' };
  try {
    const doc = await NotificationModel.create({
      organizationId: ctx.organizationId,
      userId,
      type:    String(params.type    ?? 'info'),
      title:   String(params.title   ?? 'Automation Notification'),
      message: String(params.message ?? ''),
    });
    return { success: true, output: { notificationId: doc.id } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function cancelBooking(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const bookingId = String(params.bookingId ?? '');
  if (!bookingId) return { success: false, output: {}, error: 'bookingId required' };
  try {
    await BookingModel.findOneAndUpdate(
      { _id: bookingId, organizationId: ctx.organizationId },
      { status: 'cancelled', cancellationReason: String(params.reason ?? 'Cancelled by automation') }
    );
    return { success: true, output: { bookingId } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function applyTag(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
  const tag    = String(params.tag ?? '');
  if (!leadId || !tag) return { success: false, output: {}, error: 'leadId and tag required' };
  try {
    await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId: ctx.organizationId },
      { $addToSet: { tags: tag } }
    );
    await TagModel.findOneAndUpdate(
      { organizationId: ctx.organizationId, name: tag.toLowerCase() },
      { $inc: { usageCount: 1 } }
    );
    return { success: true, output: { leadId, tag } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function removeTag(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
  const tag    = String(params.tag ?? '');
  if (!leadId || !tag) return { success: false, output: {}, error: 'leadId and tag required' };
  try {
    await LeadModel.findOneAndUpdate(
      { _id: leadId, organizationId: ctx.organizationId },
      { $pull: { tags: tag } }
    );
    return { success: true, output: { leadId, tag } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function webhookAction(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const url = String(params.url ?? '');
  if (!url) return { success: false, output: {}, error: 'url required' };
  try {
    const body    = params.body ?? ctx.triggerData;
    const secret  = String(params.secret ?? '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-LeadFlow-Workflow': ctx.workflowId,
    };
    if (secret) {
      const { createHmac } = await import('crypto');
      const sig = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
      headers['X-LeadFlow-Signature'] = `sha256=${sig}`;
    }
    const res = await fetch(url, {
      method:  String(params.method ?? 'POST'),
      headers: { ...headers, ...(params.headers as Record<string, string> ?? {}) },
      body:    JSON.stringify(body),
    });
    return { success: res.ok, output: { status: res.status, ok: res.ok } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function httpRequest(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  const url = String(params.url ?? '');
  if (!url) return { success: false, output: {}, error: 'url required' };
  try {
    const res = await fetch(url, {
      method:  String(params.method ?? 'GET'),
      headers: (params.headers as Record<string, string>) ?? {},
      body:    params.body ? JSON.stringify(params.body) : undefined,
    });
    let data: unknown = null;
    try { data = await res.json(); } catch { data = await res.text(); }
    return { success: res.ok, output: { status: res.status, data } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function slackMessage(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  const webhookUrl = String(params.webhookUrl ?? '');
  if (!webhookUrl) return { success: false, output: {}, error: 'Slack webhookUrl required' };
  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: String(params.text ?? ''), channel: params.channel }),
    });
    return { success: res.ok, output: { status: res.status } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function teamsMessage(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  const webhookUrl = String(params.webhookUrl ?? '');
  if (!webhookUrl) return { success: false, output: {}, error: 'Teams webhookUrl required' };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ '@type': 'MessageCard', text: String(params.text ?? '') }),
    });
    return { success: res.ok, output: { status: res.status } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function discordMessage(params: Record<string, unknown>, _ctx: ExecutionContext): Promise<ActionResult> {
  const webhookUrl = String(params.webhookUrl ?? '');
  if (!webhookUrl) return { success: false, output: {}, error: 'Discord webhookUrl required' };
  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: String(params.content ?? '') }),
    });
    return { success: res.ok, output: { status: res.status } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function aiSummarize(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  try {
    const conversationId = String(params.conversationId ?? ctx.executionId);
    const userMessage    = String(params.prompt ?? 'Please summarize this lead and conversation.');
    const result = await runOrchestrator({
      organizationId: ctx.organizationId,
      conversationId,
      userMessage,
      history:        [],
      memory:         emptyMemory(),
      stage:          'completed',
    });
    // Store summary on lead if leadId provided
    const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
    if (leadId && result.summary) {
      await LeadModel.findOneAndUpdate(
        { _id: leadId, organizationId: ctx.organizationId },
        { aiSummary: result.summary }
      );
    }
    return { success: true, output: { summary: result.summary ?? result.reply, reply: result.reply } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function aiGenerateEmail(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  try {
    const prompt = `Write a professional follow-up email for: ${JSON.stringify(params.context ?? ctx.triggerData)}. Tone: ${params.tone ?? 'professional'}. Subject: ${params.subject ?? 'Follow up'}.`;
    const result = await runOrchestrator({
      organizationId: ctx.organizationId,
      conversationId: ctx.executionId,
      userMessage:    prompt,
      history:        [],
      memory:         emptyMemory(),
      stage:          'recommendation',
    });
    return { success: true, output: { email: result.reply, subject: params.subject } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

async function aiScoreLead(params: Record<string, unknown>, ctx: ExecutionContext): Promise<ActionResult> {
  const leadId = String(params.leadId ?? (ctx.triggerData as any)?.id ?? '');
  if (!leadId) return { success: false, output: {}, error: 'leadId required' };
  try {
    const { qualifyLead }     = require('../../ai/qualification');
    const { emptyMemory: em } = require('../../ai/types');
    const lead  = await LeadModel.findOne({ _id: leadId, organizationId: ctx.organizationId }).lean();
    if (!lead) return { success: false, output: {}, error: 'Lead not found' };
    const memory = { ...em(), visitorName: lead.name, company: (lead as any).company, phone: lead.phone, email: lead.email };
    const score  = qualifyLead(memory);
    await LeadModel.findByIdAndUpdate(leadId, {
      score:       score.overall,
      temperature: score.temperature,
    });
    return { success: true, output: { score: score.overall, temperature: score.temperature } };
  } catch (e: any) {
    return { success: false, output: {}, error: e.message };
  }
}

// ─── Delay / Wait (returns immediately — engine handles timing) ───────────────
function waitDelay(_params: Record<string, unknown>, _ctx: ExecutionContext): ActionResult {
  // Engine intercepts 'wait'/'delay' steps before calling execute
  return { success: true, output: { deferred: true } };
}

// ─── Branch (engine intercepts before calling execute) ───────────────────────
function branchAction(_params: Record<string, unknown>, _ctx: ExecutionContext): ActionResult {
  return { success: true, output: { branched: true } };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const ACTION_MAP: Record<string, (p: Record<string, unknown>, ctx: ExecutionContext) => Promise<ActionResult> | ActionResult> = {
  create_lead:         createLead,
  update_lead:         updateLead,
  assign_owner:        assignOwner,
  move_pipeline_stage: movePipelineStage,
  create_task:         createTask,
  complete_task:       completeTask,
  create_note:         createNote,
  send_email:          sendEmail,
  send_sms:            sendSms,
  notify_user:         notifyUser,
  cancel_booking:      cancelBooking,
  apply_tag:           applyTag,
  remove_tag:          removeTag,
  webhook:             webhookAction,
  http_request:        httpRequest,
  slack_message:       slackMessage,
  teams_message:       teamsMessage,
  discord_message:     discordMessage,
  ai_summarize:        aiSummarize,
  ai_email:            aiGenerateEmail,
  ai_proposal:         aiGenerateEmail,   // reuse with different prompt
  ai_score_lead:       aiScoreLead,
  ai_classify_urgency: aiScoreLead,       // reuse scoring
  ai_suggest_stage:    aiScoreLead,
  wait:                waitDelay,
  delay:               waitDelay,
  branch:              branchAction,
  create_booking:      async (_p, _c) => ({ success: true, output: { note: 'booking creation via automation' } }),
  create_invoice:      async (_p, _c) => ({ success: true, output: { note: 'invoice creation hook' } }),
  custom_code:         async (_p, _c) => ({ success: true, output: { note: 'custom code placeholder' } }),
};

export async function executeAction(
  step: WorkflowStep,
  ctx:  ExecutionContext,
  resolvedCtx: Record<string, unknown>,
): Promise<ActionResult> {
  const handler = ACTION_MAP[step.type as ActionType];
  if (!handler) {
    return { success: false, output: {}, error: `Unknown action type: ${step.type}` };
  }
  // Interpolate template strings in params
  const interpolated = interpolateParams(step.params, resolvedCtx);
  try {
    return await handler(interpolated, ctx);
  } catch (e: any) {
    logger.warn({ err: e, stepType: step.type }, '[ActionExecutor] Unhandled error');
    return { success: false, output: {}, error: e.message };
  }
}
