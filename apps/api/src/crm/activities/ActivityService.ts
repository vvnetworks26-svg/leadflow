/**
 * ActivityService.ts
 *
 * Creates and retrieves immutable activity timeline events.
 * Every CRM action (stage change, call, note, booking, etc.) logs an activity.
 * All queries are organization-scoped.
 */

import { ActivityModel, IActivity, ActivityType } from '../../models/Activity.model';
import { PaginatedResult, paginated } from '../../utils/query';

export interface LogActivityParams {
  organizationId: string;
  type:           ActivityType;
  title:          string;
  description?:   string;
  leadId?:        string | null;
  contactId?:     string | null;
  companyId?:     string | null;
  userId?:        string | null;
  metadata?:      Record<string, unknown>;
}

export const ActivityService = {

  async log(params: LogActivityParams): Promise<IActivity> {
    const doc = await ActivityModel.create({
      organizationId: params.organizationId,
      type:           params.type,
      title:          params.title,
      description:    params.description ?? '',
      leadId:         params.leadId    ?? null,
      contactId:      params.contactId ?? null,
      companyId:      params.companyId ?? null,
      userId:         params.userId    ?? null,
      metadata:       params.metadata  ?? {},
    });
    return doc.toJSON() as unknown as IActivity;
  },

  /** Timeline for a specific lead — chronological, newest first. */
  async timelineForLead(
    organizationId: string,
    leadId:         string,
    page  = 1,
    limit = 20,
  ): Promise<PaginatedResult<IActivity>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId, leadId };
    const [docs, total] = await Promise.all([
      ActivityModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ActivityModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IActivity), total, { page, limit, skip });
  },

  /** Organization-wide activity feed. */
  async feed(
    organizationId: string,
    filters: { type?: ActivityType; userId?: string; since?: Date },
    page  = 1,
    limit = 30,
  ): Promise<PaginatedResult<IActivity>> {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (filters.type)   filter.type   = filters.type;
    if (filters.userId) filter.userId = filters.userId;
    if (filters.since)  filter.createdAt = { $gte: filters.since };
    const [docs, total] = await Promise.all([
      ActivityModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ActivityModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IActivity), total, { page, limit, skip });
  },
};
