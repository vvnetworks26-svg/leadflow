/**
 * WorkflowService.ts — CRUD for workflows + versions + folders.
 */

import { randomBytes }           from 'crypto';
import { WorkflowModel }         from '../../models/Workflow.model';
import { WorkflowExecutionModel } from '../../models/WorkflowExecution.model';
import { WorkflowFolderModel }   from '../../models/WorkflowFolder.model';
import { WorkflowWebhookModel }  from '../../models/WorkflowWebhook.model';
import { ApiError }              from '../../middleware/errorHandler';
import { PaginatedResult, paginated } from '../../utils/query';
import type { IWorkflow }        from '../../models/Workflow.model';
import type { IWorkflowExecution } from '../../models/WorkflowExecution.model';

export interface WorkflowQuery {
  status?:  string;
  search?:  string;
  folderId?:string;
  tag?:     string;
  page?:    number;
  limit?:   number;
}

interface IWorkflowFolderLean { _id: any; organizationId: string; name: string; color: string; parentId: string | null; }
interface IWorkflowWebhookLean { _id: any; organizationId: string; workflowId: string; name: string; endpoint: string; isActive: boolean; hitCount: number; lastHitAt: Date | null; }

export const WorkflowService: {
  list(organizationId: string, q: WorkflowQuery): Promise<PaginatedResult<IWorkflow>>;
  getById(organizationId: string, id: string): Promise<IWorkflow>;
  create(organizationId: string, userId: string, data: Partial<IWorkflow>): Promise<IWorkflow>;
  update(organizationId: string, id: string, userId: string, data: Partial<IWorkflow>): Promise<IWorkflow>;
  delete(organizationId: string, id: string): Promise<void>;
  toggle(organizationId: string, id: string, status: 'active' | 'paused'): Promise<IWorkflow>;
  listExecutions(organizationId: string, workflowId: string, page?: number, limit?: number): Promise<PaginatedResult<IWorkflowExecution>>;
  getExecution(organizationId: string, executionId: string): Promise<IWorkflowExecution>;
  cancelExecution(organizationId: string, executionId: string): Promise<void>;
  listFolders(organizationId: string): Promise<IWorkflowFolderLean[]>;
  createFolder(organizationId: string, data: { name: string; color?: string; parentId?: string }): Promise<any>;
  deleteFolder(organizationId: string, id: string): Promise<void>;
  createWebhook(organizationId: string, workflowId: string, name: string): Promise<any>;
  listWebhooks(organizationId: string): Promise<IWorkflowWebhookLean[]>;
  deleteWebhook(organizationId: string, id: string): Promise<void>;
} = {

  // ── Workflows ──────────────────────────────────────────────────────────────

  async list(organizationId: string, q: WorkflowQuery): Promise<PaginatedResult<IWorkflow>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (q.status)   filter.status   = q.status;
    if (q.folderId) filter.folderId = q.folderId;
    if (q.tag)      filter.tags     = q.tag;
    if (q.search) {
      const re = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { description: re }];
    }
    const [docs, total] = await Promise.all([
      WorkflowModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      WorkflowModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IWorkflow), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<IWorkflow> {
    const doc = await WorkflowModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Workflow not found', 'WORKFLOW_NOT_FOUND');
    return doc.toJSON() as unknown as IWorkflow;
  },

  async create(organizationId: string, userId: string, data: Partial<IWorkflow>): Promise<IWorkflow> {
    const doc = await WorkflowModel.create({
      ...data,
      organizationId,
      createdById:    userId,
      updatedById:    userId,
      currentVersion: 1,
    });
    return doc.toJSON() as unknown as IWorkflow;
  },

  async update(organizationId: string, id: string, userId: string, data: Partial<IWorkflow>): Promise<IWorkflow> {
    const doc = await WorkflowModel.findOneAndUpdate(
      { _id: id, organizationId },
      { ...data, updatedById: userId, $inc: { currentVersion: 1 } },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Workflow not found', 'WORKFLOW_NOT_FOUND');
    return doc.toJSON() as unknown as IWorkflow;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await WorkflowModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Workflow not found', 'WORKFLOW_NOT_FOUND');
  },

  async toggle(organizationId: string, id: string, status: 'active' | 'paused'): Promise<IWorkflow> {
    const doc = await WorkflowModel.findOneAndUpdate(
      { _id: id, organizationId },
      { status },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Workflow not found', 'WORKFLOW_NOT_FOUND');
    return doc.toJSON() as unknown as IWorkflow;
  },

  // ── Execution history ──────────────────────────────────────────────────────

  async listExecutions(organizationId: string, workflowId: string, page = 1, limit = 20): Promise<PaginatedResult<IWorkflowExecution>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId, workflowId };
    const [docs, total] = await Promise.all([
      WorkflowExecutionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      WorkflowExecutionModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IWorkflowExecution), total, { page, limit, skip });
  },

  async getExecution(organizationId: string, executionId: string): Promise<IWorkflowExecution> {
    const doc = await WorkflowExecutionModel.findOne({ _id: executionId, organizationId });
    if (!doc) throw new ApiError(404, 'Execution not found', 'EXECUTION_NOT_FOUND');
    return doc.toJSON() as unknown as IWorkflowExecution;
  },

  async cancelExecution(organizationId: string, executionId: string): Promise<void> {
    await WorkflowExecutionModel.findOneAndUpdate(
      { _id: executionId, organizationId, status: { $in: ['pending','running','waiting','retrying'] } },
      { status: 'cancelled', completedAt: new Date() }
    );
  },

  // ── Folders ────────────────────────────────────────────────────────────────

  async listFolders(organizationId: string) {
    return WorkflowFolderModel.find({ organizationId }).sort({ name: 1 }).lean();
  },

  async createFolder(organizationId: string, data: { name: string; color?: string; parentId?: string }) {
    return WorkflowFolderModel.create({ ...data, organizationId });
  },

  async deleteFolder(organizationId: string, id: string): Promise<void> {
    await WorkflowFolderModel.findOneAndDelete({ _id: id, organizationId });
    // Move workflows in folder to root
    await WorkflowModel.updateMany({ organizationId, folderId: id }, { folderId: null });
  },

  // ── Webhooks ───────────────────────────────────────────────────────────────

  async createWebhook(organizationId: string, workflowId: string, name: string) {
    const token    = randomBytes(32).toString('hex');
    const endpoint = randomBytes(12).toString('hex');
    const doc = await WorkflowWebhookModel.create({
      organizationId, workflowId, name, token, endpoint, isActive: true,
    });
    return { ...doc.toJSON(), token };  // expose token once on creation
  },

  async listWebhooks(organizationId: string) {
    return WorkflowWebhookModel.find({ organizationId }).lean();
  },

  async deleteWebhook(organizationId: string, id: string): Promise<void> {
    await WorkflowWebhookModel.findOneAndDelete({ _id: id, organizationId });
  },
};
