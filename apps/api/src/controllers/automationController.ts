/**
 * automationController.ts
 *
 * All automation engine API handlers.
 * Every handler reads organizationId from req.organizationId.
 */

import { Request, Response, NextFunction } from 'express';
import { createHmac }              from 'crypto';
import { param }                   from '../utils/params';
import { ApiError }                from '../middleware/errorHandler';

import { WorkflowService }         from '../automation/workflow/WorkflowService';
import { WorkflowEngine }          from '../automation/engine/WorkflowEngine';
import { WorkflowTemplateService } from '../automation/templates/WorkflowTemplateService';
import { WorkflowAnalyticsService } from '../automation/analytics/WorkflowAnalyticsService';
import { WorkflowWebhookModel }    from '../models/WorkflowWebhook.model';
import { z }                       from 'zod';
import { parseQuery }              from '../utils/validate';

const WorkflowQuerySchema = z.object({
  status:  z.string().optional(),
  search:  z.string().optional(),
  folderId:z.string().optional(),
  tag:     z.string().optional(),
  page:    z.coerce.number().int().min(1).optional(),
  limit:   z.coerce.number().int().min(1).max(100).optional(),
});

// ─── Workflows ────────────────────────────────────────────────────────────────

export async function listWorkflows(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(WorkflowQuerySchema, req.query);
    const result = await WorkflowService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const wf = await WorkflowService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: wf });
  } catch (e) { next(e); }
}

export async function createWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const wf = await WorkflowService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: wf });
  } catch (e) { next(e); }
}

export async function updateWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const wf = await WorkflowService.update(req.organizationId!, param(req.params.id), req.user!.sub, req.body);
    res.json({ status: 'ok', data: wf });
  } catch (e) { next(e); }
}

export async function deleteWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    await WorkflowService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function toggleWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body as { status: 'active' | 'paused' };
    if (!status) throw new ApiError(422, 'status is required', 'VALIDATION_ERROR');
    const wf = await WorkflowService.toggle(req.organizationId!, param(req.params.id), status);
    res.json({ status: 'ok', data: wf });
  } catch (e) { next(e); }
}

// ─── Execution ────────────────────────────────────────────────────────────────

export async function executeWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const executionId = await WorkflowEngine.executeManual(
      req.organizationId!,
      param(req.params.id),
      req.body ?? {},
      req.user!.sub,
    );
    res.status(202).json({ status: 'ok', data: { executionId } });
  } catch (e) { next(e); }
}

export async function listExecutions(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page  ?? 1);
    const limit  = Number(req.query.limit ?? 20);
    const result = await WorkflowService.listExecutions(req.organizationId!, param(req.params.id), page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getExecution(req: Request, res: Response, next: NextFunction) {
  try {
    const exec = await WorkflowService.getExecution(req.organizationId!, param(req.params.executionId));
    res.json({ status: 'ok', data: exec });
  } catch (e) { next(e); }
}

export async function cancelExecution(req: Request, res: Response, next: NextFunction) {
  try {
    await WorkflowService.cancelExecution(req.organizationId!, param(req.params.executionId));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(_req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await WorkflowTemplateService.list();
    res.json({ status: 'ok', data: templates });
  } catch (e) { next(e); }
}

export async function createFromTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body as { name?: string };
    const workflowId = await WorkflowTemplateService.createFromTemplate(
      param(req.params.id),
      req.organizationId!,
      req.user!.sub,
      name,
    );
    res.status(201).json({ status: 'ok', data: { workflowId } });
  } catch (e) { next(e); }
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export async function listFolders(req: Request, res: Response, next: NextFunction) {
  try {
    const folders = await WorkflowService.listFolders(req.organizationId!);
    res.json({ status: 'ok', data: folders });
  } catch (e) { next(e); }
}

export async function createFolder(req: Request, res: Response, next: NextFunction) {
  try {
    const folder = await WorkflowService.createFolder(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: folder });
  } catch (e) { next(e); }
}

export async function deleteFolder(req: Request, res: Response, next: NextFunction) {
  try {
    await WorkflowService.deleteFolder(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function listWebhooks(req: Request, res: Response, next: NextFunction) {
  try {
    const hooks = await WorkflowService.listWebhooks(req.organizationId!);
    res.json({ status: 'ok', data: hooks });
  } catch (e) { next(e); }
}

export async function createWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const { workflowId, name } = req.body as { workflowId: string; name: string };
    if (!workflowId || !name) throw new ApiError(422, 'workflowId and name required', 'VALIDATION_ERROR');
    const hook = await WorkflowService.createWebhook(req.organizationId!, workflowId, name);
    res.status(201).json({ status: 'ok', data: hook });
  } catch (e) { next(e); }
}

export async function deleteWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    await WorkflowService.deleteWebhook(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

/**
 * POST /api/v1/automation/webhooks/incoming/:endpoint
 * Public endpoint — no auth. Verified by HMAC-SHA256 signature.
 */
export async function incomingWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const endpoint = param(req.params.endpoint);
    const hook     = await WorkflowWebhookModel
      .findOne({ endpoint, isActive: true })
      .select('+token')
      .lean();

    if (!hook) {
      res.status(404).json({ status: 'error', message: 'Webhook not found' });
      return;
    }

    // Verify signature if provided
    const sig = req.headers['x-leadflow-signature'] as string | undefined;
    if (sig && hook.token) {
      const expected = 'sha256=' + createHmac('sha256', hook.token).update(JSON.stringify(req.body)).digest('hex');
      if (sig !== expected) {
        res.status(401).json({ status: 'error', message: 'Invalid signature' });
        return;
      }
    }

    // Update hit count
    await WorkflowWebhookModel.findByIdAndUpdate(hook._id, {
      $inc: { hitCount: 1 }, lastHitAt: new Date(),
    });

    // Trigger the workflow
    WorkflowEngine.trigger('webhook_received', hook.organizationId, {
      webhookId: hook._id.toString(),
      payload:   req.body,
    });

    res.json({ status: 'ok', message: 'Webhook received' });
  } catch (e) { next(e); }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getAutomationAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    const stats  = await WorkflowAnalyticsService.getStats(req.organizationId!, since);
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}
