/**
 * LeadService.ts — Upgraded for full CRM pipeline management.
 * All queries are strictly organization-scoped.
 * Pipeline movement, duplicate detection, activity logging, and automation
 * are integrated directly into the service.
 */

import { LeadModel } from '../models/Lead.model';
import { ApiError }  from '../middleware/errorHandler';
import { CreateLeadDto, UpdateLeadDto, LeadQueryDto, MoveStageDto } from '../dto/lead.dto';
import { Lead }      from '../types';
import { PaginatedResult, paginated } from '../utils/query';
import { ActivityService }   from '../crm/activities/ActivityService';
import { AutomationService } from '../crm/automation/AutomationService';
import { WorkflowEngine }    from '../automation/engine/WorkflowEngine';

export const LeadService = {

  async list(organizationId: string, q: LeadQueryDto): Promise<PaginatedResult<Lead>> {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 20;
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };
    if (q.status)         filter.status         = q.status;
    if (q.priority)       filter.priority       = q.priority;
    if (q.temperature)    filter.temperature    = q.temperature;
    if (q.lifecycleStage) filter.lifecycleStage = q.lifecycleStage;
    if (q.pipelineId)     filter.pipelineId     = q.pipelineId;
    if (q.stageId)        filter.stageId        = q.stageId;
    if (q.ownerId)        filter.ownerId        = q.ownerId;
    if (q.source)         filter.source         = q.source;
    if (q.tags)           filter.tags           = { $in: q.tags.split(',').map(t => t.trim()) };
    if (q.minScore !== undefined) filter.score  = { $gte: q.minScore };
    if (q.maxScore !== undefined) filter.score  = { ...(filter.score as any ?? {}), $lte: q.maxScore };
    if (q.search) {
      const re = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }, { company: re }, { hvacNeed: re }];
    }

    const sortField = q.sortBy ?? 'createdAt';
    const sortOrder = q.order  === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      LeadModel.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit),
      LeadModel.countDocuments(filter),
    ]);

    return paginated(docs.map(d => d.toJSON() as unknown as Lead), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<Lead> {
    const doc = await LeadModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
    return doc.toJSON() as unknown as Lead;
  },

  async create(organizationId: string, dto: CreateLeadDto): Promise<Lead> {
    const doc = await LeadModel.create({ ...dto, organizationId });
    const lead = doc.toJSON() as unknown as Lead;

    // Log activity
    ActivityService.log({
      organizationId,
      type:        'lead_created',
      title:       `Lead created: ${lead.name}`,
      description: `Source: ${lead.source || 'direct'}`,
      leadId:      lead.id,
      userId:      dto.ownerId ?? null,
    }).catch(() => {});

    // Fire automation (legacy rules engine)
    AutomationService.fire('lead_created', organizationId, lead.id, {
      source:      lead.source,
      status:      lead.status,
      temperature: lead.temperature,
    });

    // Fire workflow engine
    WorkflowEngine.trigger('lead_created', organizationId, { ...lead, id: lead.id });

    return lead;
  },

  async update(organizationId: string, id: string, dto: UpdateLeadDto): Promise<Lead> {
    const doc = await LeadModel.findOneAndUpdate(
      { _id: id, organizationId },
      dto,
      { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
    return doc.toJSON() as unknown as Lead;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    const doc = await LeadModel.findOneAndDelete({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
  },

  /** Move a lead to a new pipeline stage (Kanban drag-and-drop). */
  async moveStage(
    organizationId: string,
    id:             string,
    dto:            MoveStageDto,
    userId?:        string,
  ): Promise<Lead> {
    const existing = await LeadModel.findOne({ _id: id, organizationId });
    if (!existing) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');

    const prevStageName = existing.stageName;

    const doc = await LeadModel.findOneAndUpdate(
      { _id: id, organizationId },
      {
        pipelineId: dto.pipelineId,
        stageId:    dto.stageId,
        stageName:  dto.stageName,
      },
      { new: true }
    );
    const lead = doc!.toJSON() as unknown as Lead;

    // Log stage change activity
    ActivityService.log({
      organizationId,
      type:        'stage_changed',
      title:       `Stage changed: ${prevStageName ?? 'Unassigned'} → ${dto.stageName}`,
      description: dto.reason ?? '',
      leadId:      id,
      userId:      userId ?? null,
      metadata:    { from: prevStageName, to: dto.stageName, reason: dto.reason },
    }).catch(() => {});

    // Fire automation
    AutomationService.fire('stage_changed', organizationId, id, {
      from:      prevStageName,
      to:        dto.stageName,
      stageId:   dto.stageId,
      pipelineId:dto.pipelineId,
    });

    // Fire workflow engine
    WorkflowEngine.trigger('lead_updated', organizationId, { ...lead, id, prevStageName });

    // Check win/loss
    if (dto.stageName?.toLowerCase() === 'won') {
      await LeadModel.findOneAndUpdate(
        { _id: id, organizationId },
        { status: 'Closed Won', wonDate: new Date() }
      );
      AutomationService.fire('lead_won', organizationId, id, { stageName: dto.stageName });
    } else if (dto.stageName?.toLowerCase() === 'lost') {
      await LeadModel.findOneAndUpdate(
        { _id: id, organizationId },
        { status: 'Closed Lost' }
      );
      AutomationService.fire('lead_lost', organizationId, id, { stageName: dto.stageName });
    }

    return lead;
  },

  /** Update AI-generated fields (score, summaries, win probability). */
  async updateAIFields(
    organizationId: string,
    id:             string,
    fields: {
      score?:               number;
      temperature?:         string;
      aiSummary?:           string;
      conversationSummary?: string;
      winProbability?:      number;
      riskScore?:           number;
    },
  ): Promise<Lead> {
    const doc = await LeadModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: fields },
      { new: true }
    );
    if (!doc) throw new ApiError(404, 'Lead not found', 'LEAD_NOT_FOUND');
    return doc.toJSON() as unknown as Lead;
  },

  /** Increment activity/task counters. */
  async incrementCounter(
    organizationId: string,
    id:             string,
    field:          'activityCount' | 'taskCount',
    delta           = 1,
  ): Promise<void> {
    await LeadModel.findOneAndUpdate(
      { _id: id, organizationId },
      { $inc: { [field]: delta }, lastContactAt: new Date() }
    );
  },

  async countByOrganization(organizationId: string): Promise<number> {
    return LeadModel.countDocuments({ organizationId });
  },

  async statsByOrganization(organizationId: string): Promise<Record<string, number>> {
    const results = await LeadModel.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return results.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  },

  /** Find all leads for Kanban — grouped by stage for a pipeline. */
  async kanban(organizationId: string, pipelineId: string): Promise<Record<string, Lead[]>> {
    const docs = await LeadModel.find({ organizationId, pipelineId }).sort({ score: -1, createdAt: -1 });
    const grouped: Record<string, Lead[]> = {};
    for (const doc of docs) {
      const stage = doc.stageName ?? 'Unassigned';
      if (!grouped[stage]) grouped[stage] = [];
      grouped[stage].push(doc.toJSON() as unknown as Lead);
    }
    return grouped;
  },
};
