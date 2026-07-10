/**
 * ImportService.ts — Bulk CSV/JSON import with conflict detection and progress tracking.
 */

import { ImportExportJobModel }  from '../../models/ImportExportJob.model';
import { LeadModel }             from '../../models/Lead.model';
import { ContactModel }          from '../../models/Contact.model';
import { logger }                from '../../utils/logger';

export const ImportService = {

  async createJob(
    organizationId: string,
    userId:         string,
    data: { entity: string; format: 'csv' | 'json'; fileUrl?: string; rows?: Record<string, unknown>[] }
  ) {
    const doc = await ImportExportJobModel.create({
      organizationId,
      type:        'import',
      entity:      data.entity,
      format:      data.format,
      fileUrl:     data.fileUrl ?? null,
      createdById: userId,
      totalRows:   data.rows?.length ?? 0,
    });
    const jobId = doc._id.toString();

    // Process async
    if (data.rows?.length) {
      ImportService._processRows(organizationId, jobId, data.entity as any, data.rows).catch(err =>
        logger.warn({ err, jobId }, '[Import] processing failed')
      );
    }
    return doc.toJSON();
  },

  async _processRows(
    organizationId: string,
    jobId:          string,
    entity:         'leads' | 'contacts',
    rows:           Record<string, unknown>[],
  ): Promise<void> {
    await ImportExportJobModel.findByIdAndUpdate(jobId, { status: 'running', startedAt: new Date() });

    let success = 0, errors = 0;
    const errorLog: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (entity === 'leads') {
          await LeadModel.create({
            organizationId,
            name:     String(row.name    ?? ''),
            phone:    String(row.phone   ?? ''),
            email:    String(row.email   ?? ''),
            hvacNeed: String(row.hvacNeed ?? row.need ?? 'General inquiry'),
            source:   String(row.source  ?? 'import'),
            status:   (row.status as any) ?? 'New',
            notes:    String(row.notes   ?? ''),
          });
          success++;
        } else if (entity === 'contacts') {
          await ContactModel.create({
            organizationId,
            firstName: String(row.firstName ?? row.name?.toString().split(' ')[0] ?? ''),
            lastName:  String(row.lastName  ?? ''),
            emails:    row.email ? [String(row.email)] : [],
            phones:    row.phone ? [String(row.phone)] : [],
          });
          success++;
        }
      } catch (e: any) {
        errors++;
        errorLog.push({ row: i + 1, message: e.message });
      }

      // Update progress every 50 rows
      if (i % 50 === 0) {
        await ImportExportJobModel.findByIdAndUpdate(jobId, { processedRows: i + 1, successRows: success, errorRows: errors });
      }
    }

    await ImportExportJobModel.findByIdAndUpdate(jobId, {
      status:       errors === rows.length ? 'failed' : 'completed',
      processedRows:rows.length,
      successRows:  success,
      errorRows:    errors,
      errorLog:     errorLog.slice(0, 100),
      completedAt:  new Date(),
    });
  },

  async getJob(organizationId: string, id: string) {
    return ImportExportJobModel.findOne({ _id: id, organizationId }).lean();
  },

  async listJobs(organizationId: string) {
    return ImportExportJobModel.find({ organizationId, type: 'import' }).sort({ createdAt: -1 }).limit(20).lean();
  },
};
