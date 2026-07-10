/**
 * DeploymentService.ts
 *
 * Widget deployment versioning — list, rollback, diff, archive.
 */

import { WidgetDeploymentModel, IWidgetDeployment } from '../../models/WidgetDeployment.model';
import { WidgetConfigurationModel }                 from '../../models/WidgetConfiguration.model';
import { ApiError }                                 from '../../middleware/errorHandler';
import { PaginatedResult, paginated }               from '../../utils/query';

export const DeploymentService = {

  async list(organizationId: string, page = 1, limit = 20): Promise<PaginatedResult<IWidgetDeployment>> {
    const skip = (page - 1) * limit;
    const filter = { organizationId };
    const [docs, total] = await Promise.all([
      WidgetDeploymentModel.find(filter).sort({ version: -1 }).skip(skip).limit(limit),
      WidgetDeploymentModel.countDocuments(filter),
    ]);
    return paginated(docs.map(d => d.toJSON() as unknown as IWidgetDeployment), total, { page, limit, skip });
  },

  async getById(organizationId: string, id: string): Promise<IWidgetDeployment> {
    const doc = await WidgetDeploymentModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
    return doc.toJSON() as unknown as IWidgetDeployment;
  },

  /** Rollback to a previous version — restores its configSnapshot as the current draft. */
  async rollback(organizationId: string, deploymentId: string, userId: string): Promise<IWidgetDeployment> {
    const target = await WidgetDeploymentModel.findOne({ _id: deploymentId, organizationId });
    if (!target) throw new ApiError(404, 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');

    // Restore snapshot to live config
    const snap = target.configSnapshot as any;
    await WidgetConfigurationModel.findOneAndUpdate(
      { organizationId },
      { $set: { ...snap, organizationId, publishedVersion: target.version } }
    );

    // Archive current published
    await WidgetDeploymentModel.updateMany(
      { organizationId, status: 'published' },
      { status: 'archived', archivedAt: new Date() }
    );

    // Re-publish target version
    const doc = await WidgetDeploymentModel.findByIdAndUpdate(
      deploymentId,
      { status: 'published', publishedAt: new Date(), publishedById: userId },
      { new: true }
    );

    return doc!.toJSON() as unknown as IWidgetDeployment;
  },

  /** Generate a simple diff between two deployment snapshots. */
  diff(snapshotA: Record<string, unknown>, snapshotB: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const allKeys = new Set([...Object.keys(snapshotA), ...Object.keys(snapshotB)]);
    for (const key of allKeys) {
      const a = JSON.stringify(snapshotA[key]);
      const b = JSON.stringify(snapshotB[key]);
      if (a !== b) changes[key] = { from: snapshotA[key], to: snapshotB[key] };
    }
    return changes;
  },
};
