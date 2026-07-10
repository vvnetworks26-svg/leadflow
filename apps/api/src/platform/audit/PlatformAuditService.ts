/**
 * PlatformAuditService.ts — Platform audit log queries and export.
 */

import { PlatformAuditLogModel, IPlatformAuditLog } from '../../models/PlatformAuditLog.model';
import { PaginatedResult, paginated }                from '../../utils/query';

export const PlatformAuditService = {

  async list(
    organizationId: string,
    filters: {
      event?:    string;
      actorId?:  string;
      since?:    Date;
      page?:     number;
      limit?:    number;
    } = {}
  ): Promise<PaginatedResult<IPlatformAuditLog>> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 30;
    const skip  = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };
    if (filters.event)   filter.event   = filters.event;
    if (filters.actorId) filter.actorId = filters.actorId;
    if (filters.since)   filter.createdAt = { $gte: filters.since };

    const [docs, total] = await Promise.all([
      PlatformAuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PlatformAuditLogModel.countDocuments(filter),
    ]);

    return paginated(docs as unknown as IPlatformAuditLog[], total, { page, limit, skip });
  },

  async exportCsv(organizationId: string, since?: Date): Promise<string> {
    const filter: Record<string, unknown> = { organizationId };
    if (since) filter.createdAt = { $gte: since };
    const logs = await PlatformAuditLogModel.find(filter).sort({ createdAt: -1 }).limit(10000).lean();

    const headers = 'timestamp,event,actorId,actorType,resourceType,resourceId,ipAddress';
    const rows    = logs.map((l: any) =>
      `"${l.createdAt?.toISOString() ?? ''}","${l.event}","${l.actorId ?? ''}","${l.actorType}","${l.resourceType}","${l.resourceId ?? ''}","${l.ipAddress}"`
    );
    return [headers, ...rows].join('\n');
  },
};
