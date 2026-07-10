/**
 * crmController.ts
 *
 * Handles all CRM endpoints:
 *   Pipeline + Stages, Companies, Contacts, Activities,
 *   Notes, Tasks, Tags, Search, Dashboard, Automation,
 *   Duplicate detection, Saved Filters, Kanban.
 *
 * Every handler reads organizationId from req.organizationId (set by authenticate middleware).
 */

import { Request, Response, NextFunction } from 'express';
import { param }                from '../utils/params';
import { parseQuery }           from '../utils/validate';
import { ApiError }             from '../middleware/errorHandler';
import { z }                    from 'zod';

import { PipelineService }     from '../crm/pipeline/PipelineService';
import { ContactService }      from '../crm/contacts/ContactService';
import { CompanyService }      from '../crm/contacts/CompanyService';
import { ActivityService }     from '../crm/activities/ActivityService';
import { NoteService }         from '../crm/notes/NoteService';
import { TaskService }         from '../crm/tasks/TaskService';
import { TagService }          from '../crm/tags/TagService';
import { SearchService }       from '../crm/search/SearchService';
import { DashboardService }    from '../crm/dashboard/DashboardService';
import { AutomationService }   from '../crm/automation/AutomationService';
import { DuplicateService }    from '../crm/contacts/DuplicateService';
import { SavedFilterModel }    from '../models/SavedFilter.model';
import { LeadService }         from '../services/LeadService';
import { LeadQuerySchema, MoveStageSchema } from '../dto/lead.dto';

// ─── Pipelines ────────────────────────────────────────────────────────────────

export async function listPipelines(req: Request, res: Response, next: NextFunction) {
  try {
    const pipelines = await PipelineService.list(req.organizationId!);
    res.json({ status: 'ok', data: pipelines });
  } catch (e) { next(e); }
}

export async function getPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function createPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function updatePipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function deletePipeline(req: Request, res: Response, next: NextFunction) {
  try {
    await PipelineService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function addStage(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.addStage(req.organizationId!, param(req.params.id), req.body);
    res.status(201).json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function updateStage(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.updateStage(req.organizationId!, param(req.params.id), param(req.params.stageId), req.body);
    res.json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function deleteStage(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await PipelineService.deleteStage(req.organizationId!, param(req.params.id), param(req.params.stageId));
    res.json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

export async function reorderStages(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    const pipeline = await PipelineService.reorderStages(req.organizationId!, param(req.params.id), orderedIds);
    res.json({ status: 'ok', data: pipeline });
  } catch (e) { next(e); }
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

export async function getKanban(req: Request, res: Response, next: NextFunction) {
  try {
    const pipelineId = param(req.params.pipelineId);
    const board      = await LeadService.kanban(req.organizationId!, pipelineId);
    res.json({ status: 'ok', data: board });
  } catch (e) { next(e); }
}

export async function moveLeadStage(req: Request, res: Response, next: NextFunction) {
  try {
    const result = MoveStageSchema.safeParse(req.body);
    if (!result.success) throw new ApiError(422, result.error.message, 'VALIDATION_ERROR');
    const lead = await LeadService.moveStage(
      req.organizationId!,
      param(req.params.id),
      result.data,
      req.user?.sub,
    );
    res.json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

// ─── Companies ────────────────────────────────────────────────────────────────

const CompanyQuerySchema = z.object({
  search:   z.string().optional(),
  industry: z.string().optional(),
  ownerId:  z.string().optional(),
  tags:     z.string().optional(),
  page:     z.coerce.number().int().min(1).optional(),
  limit:    z.coerce.number().int().min(1).max(100).optional(),
  sortBy:   z.string().optional(),
  order:    z.enum(['asc','desc']).optional(),
});

export async function listCompanies(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(CompanyQuerySchema, req.query);
    const result = await CompanyService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await CompanyService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: company });
  } catch (e) { next(e); }
}

export async function createCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await CompanyService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: company });
  } catch (e) { next(e); }
}

export async function updateCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await CompanyService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: company });
  } catch (e) { next(e); }
}

export async function deleteCompany(req: Request, res: Response, next: NextFunction) {
  try {
    await CompanyService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function getCompanyStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await CompanyService.getStats(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: stats });
  } catch (e) { next(e); }
}

export async function findCompanyDuplicates(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, domain } = req.query as { name?: string; domain?: string };
    if (!name) throw new ApiError(422, 'name is required', 'VALIDATION_ERROR');
    const dupes = await CompanyService.findDuplicates(req.organizationId!, name, domain);
    res.json({ status: 'ok', data: dupes });
  } catch (e) { next(e); }
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

const ContactQuerySchema = z.object({
  search:    z.string().optional(),
  companyId: z.string().optional(),
  tags:      z.string().optional(),
  ownerId:   z.string().optional(),
  page:      z.coerce.number().int().min(1).optional(),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  sortBy:    z.string().optional(),
  order:     z.enum(['asc','desc']).optional(),
});

export async function listContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(ContactQuerySchema, req.query);
    const result = await ContactService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getContact(req: Request, res: Response, next: NextFunction) {
  try {
    const contact = await ContactService.getById(req.organizationId!, param(req.params.id));
    res.json({ status: 'ok', data: contact });
  } catch (e) { next(e); }
}

export async function createContact(req: Request, res: Response, next: NextFunction) {
  try {
    const contact = await ContactService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: contact });
  } catch (e) { next(e); }
}

export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    const contact = await ContactService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: contact });
  } catch (e) { next(e); }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction) {
  try {
    await ContactService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function mergeContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetId, sourceId } = req.body as { targetId: string; sourceId: string };
    if (!targetId || !sourceId) throw new ApiError(422, 'targetId and sourceId are required', 'VALIDATION_ERROR');
    const contact = await ContactService.merge(req.organizationId!, targetId, sourceId);
    res.json({ status: 'ok', data: contact });
  } catch (e) { next(e); }
}

// ─── Activities ───────────────────────────────────────────────────────────────

export async function getLeadTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Number(req.query.page  ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await ActivityService.timelineForLead(req.organizationId!, param(req.params.leadId), page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function getActivityFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const page   = Number(req.query.page  ?? 1);
    const limit  = Number(req.query.limit ?? 30);
    const result = await ActivityService.feed(req.organizationId!, {
      type:   req.query.type   as any,
      userId: req.query.userId as string | undefined,
      since:  req.query.since  ? new Date(req.query.since as string) : undefined,
    }, page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function logActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const activity = await ActivityService.log({ ...req.body, organizationId: req.organizationId!, userId: req.user!.sub });
    res.status(201).json({ status: 'ok', data: activity });
  } catch (e) { next(e); }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function listNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Number(req.query.page  ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await NoteService.listForLead(req.organizationId!, param(req.params.leadId), page, limit);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function createNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await NoteService.create(req.organizationId!, req.user!.sub, req.body);
    res.status(201).json({ status: 'ok', data: note });
  } catch (e) { next(e); }
}

export async function updateNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await NoteService.update(req.organizationId!, param(req.params.id), req.user!.sub, req.body);
    res.json({ status: 'ok', data: note });
  } catch (e) { next(e); }
}

export async function deleteNote(req: Request, res: Response, next: NextFunction) {
  try {
    await NoteService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function pinNote(req: Request, res: Response, next: NextFunction) {
  try {
    const { pinned } = req.body as { pinned: boolean };
    const note = await NoteService.pin(req.organizationId!, param(req.params.id), pinned ?? true);
    res.json({ status: 'ok', data: note });
  } catch (e) { next(e); }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

const TaskQuerySchema = z.object({
  ownerId:   z.string().optional(),
  leadId:    z.string().optional(),
  completed: z.coerce.boolean().optional(),
  overdue:   z.coerce.boolean().optional(),
  priority:  z.enum(['Low','Medium','High','Urgent']).optional(),
  type:      z.enum(['Call','Email','Meeting','Follow-up','Proposal','Custom','Support']).optional(),
  page:      z.coerce.number().int().min(1).optional(),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  sortBy:    z.string().optional(),
  order:     z.enum(['asc','desc']).optional(),
});

export async function listTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const q      = parseQuery(TaskQuerySchema, req.query);
    const result = await TaskService.list(req.organizationId!, q);
    res.json({ status: 'ok', ...result });
  } catch (e) { next(e); }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await TaskService.create(req.organizationId!, req.body);
    // Increment lead task counter
    if (req.body.leadId) {
      LeadService.incrementCounter(req.organizationId!, req.body.leadId, 'taskCount').catch(() => {});
    }
    res.status(201).json({ status: 'ok', data: task });
  } catch (e) { next(e); }
}

export async function updateTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await TaskService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: task });
  } catch (e) { next(e); }
}

export async function completeTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await TaskService.complete(req.organizationId!, param(req.params.id), req.user!.sub);
    res.json({ status: 'ok', data: task });
  } catch (e) { next(e); }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction) {
  try {
    await TaskService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function listTags(req: Request, res: Response, next: NextFunction) {
  try {
    const tags = await TagService.list(req.organizationId!);
    res.json({ status: 'ok', data: tags });
  } catch (e) { next(e); }
}

export async function suggestTags(req: Request, res: Response, next: NextFunction) {
  try {
    const query = String(req.query.q ?? '');
    const tags  = await TagService.suggest(req.organizationId!, query);
    res.json({ status: 'ok', data: tags });
  } catch (e) { next(e); }
}

export async function createTag(req: Request, res: Response, next: NextFunction) {
  try {
    const tag = await TagService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: tag });
  } catch (e) { next(e); }
}

export async function updateTag(req: Request, res: Response, next: NextFunction) {
  try {
    const tag = await TagService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: tag });
  } catch (e) { next(e); }
}

export async function deleteTag(req: Request, res: Response, next: NextFunction) {
  try {
    await TagService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function globalSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const query    = String(req.query.q ?? '');
    const entities = req.query.entities
      ? String(req.query.entities).split(',') as any
      : undefined;
    const limit    = Number(req.query.limit ?? 20);
    const result   = await SearchService.search(req.organizationId!, query, entities, limit);
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const metrics = await DashboardService.getMetrics(req.organizationId!);
    res.json({ status: 'ok', data: metrics });
  } catch (e) { next(e); }
}

// ─── Automation ───────────────────────────────────────────────────────────────

export async function listAutomations(req: Request, res: Response, next: NextFunction) {
  try {
    const rules = await AutomationService.list(req.organizationId!);
    res.json({ status: 'ok', data: rules });
  } catch (e) { next(e); }
}

export async function createAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await AutomationService.create(req.organizationId!, req.body);
    res.status(201).json({ status: 'ok', data: rule });
  } catch (e) { next(e); }
}

export async function updateAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const rule = await AutomationService.update(req.organizationId!, param(req.params.id), req.body);
    res.json({ status: 'ok', data: rule });
  } catch (e) { next(e); }
}

export async function toggleAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = req.body as { isActive: boolean };
    const rule = await AutomationService.toggle(req.organizationId!, param(req.params.id), isActive);
    res.json({ status: 'ok', data: rule });
  } catch (e) { next(e); }
}

export async function deleteAutomation(req: Request, res: Response, next: NextFunction) {
  try {
    await AutomationService.delete(req.organizationId!, param(req.params.id));
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Duplicates ───────────────────────────────────────────────────────────────

export async function detectLeadDuplicates(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, phone, company, excludeId } = req.body as any;
    if (!name || !phone) throw new ApiError(422, 'name and phone are required', 'VALIDATION_ERROR');
    const result = await DuplicateService.findLeadDuplicates(
      req.organizationId!, { name, email, phone, company }, excludeId
    );
    res.json({ status: 'ok', data: result });
  } catch (e) { next(e); }
}

export async function mergeLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const { targetId, sourceId } = req.body as { targetId: string; sourceId: string };
    if (!targetId || !sourceId) throw new ApiError(422, 'targetId and sourceId are required', 'VALIDATION_ERROR');
    const lead = await DuplicateService.mergeLeads(req.organizationId!, targetId, sourceId);
    res.json({ status: 'ok', data: lead });
  } catch (e) { next(e); }
}

// ─── Saved Filters ────────────────────────────────────────────────────────────

export async function listSavedFilters(req: Request, res: Response, next: NextFunction) {
  try {
    const entity = req.query.entity as string | undefined;
    const filter: Record<string, unknown> = { organizationId: req.organizationId!, userId: req.user!.sub };
    if (entity) filter.entity = entity;
    const docs = await SavedFilterModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ status: 'ok', data: docs });
  } catch (e) { next(e); }
}

export async function createSavedFilter(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, entity, filters } = req.body;
    if (!name || !entity) throw new ApiError(422, 'name and entity are required', 'VALIDATION_ERROR');
    const doc = await SavedFilterModel.create({
      organizationId: req.organizationId!,
      userId:         req.user!.sub,
      name, entity, filters: filters ?? {},
    });
    res.status(201).json({ status: 'ok', data: doc });
  } catch (e) { next(e); }
}

export async function deleteSavedFilter(req: Request, res: Response, next: NextFunction) {
  try {
    await SavedFilterModel.findOneAndDelete({
      _id: param(req.params.id),
      organizationId: req.organizationId!,
      userId: req.user!.sub,
    });
    res.status(204).send();
  } catch (e) { next(e); }
}
