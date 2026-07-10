/**
 * PipelineService.ts
 *
 * Manages customizable sales pipelines and their stages.
 * Every organization can have multiple pipelines.
 * Default pipeline is seeded on onboarding via OrganizationService.
 */

import { randomUUID } from 'crypto';
import { PipelineModel, defaultPipelineStages, IPipeline, IPipelineStage } from '../../models/Pipeline.model';
import { ApiError } from '../../middleware/errorHandler';

export const PipelineService = {

  async list(organizationId: string): Promise<IPipeline[]> {
    const docs = await PipelineModel.find({ organizationId }).sort({ isDefault: -1, createdAt: 1 });
    return docs.map(d => d.toJSON() as unknown as IPipeline);
  },

  async getById(organizationId: string, pipelineId: string): Promise<IPipeline> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    return doc.toJSON() as unknown as IPipeline;
  },

  async getDefault(organizationId: string): Promise<IPipeline | null> {
    const doc = await PipelineModel.findOne({ organizationId, isDefault: true });
    return doc ? (doc.toJSON() as unknown as IPipeline) : null;
  },

  async create(organizationId: string, data: { name: string; description?: string }): Promise<IPipeline> {
    const doc = await PipelineModel.create({
      organizationId,
      name:        data.name,
      description: data.description ?? '',
      stages:      defaultPipelineStages(),
      isDefault:   false,
    });
    return doc.toJSON() as unknown as IPipeline;
  },

  async update(organizationId: string, pipelineId: string, data: Partial<Pick<IPipeline, 'name' | 'description'>>): Promise<IPipeline> {
    const doc = await PipelineModel.findOneAndUpdate(
      { _id: pipelineId, organizationId },
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    return doc.toJSON() as unknown as IPipeline;
  },

  async delete(organizationId: string, pipelineId: string): Promise<void> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    if (doc.isDefault) throw new ApiError(400, 'Cannot delete the default pipeline', 'DEFAULT_PIPELINE');
    await PipelineModel.findByIdAndDelete(pipelineId);
  },

  // ── Stage management ───────────────────────────────────────────────────────

  async addStage(organizationId: string, pipelineId: string, stage: Omit<IPipelineStage, 'id'>): Promise<IPipeline> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    const newStage: IPipelineStage = { ...stage, id: randomUUID() };
    doc.stages.push(newStage);
    doc.stages.sort((a, b) => a.order - b.order);
    await doc.save();
    return doc.toJSON() as unknown as IPipeline;
  },

  async updateStage(organizationId: string, pipelineId: string, stageId: string, patch: Partial<IPipelineStage>): Promise<IPipeline> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    const idx = doc.stages.findIndex(s => s.id === stageId);
    if (idx === -1) throw new ApiError(404, 'Stage not found', 'STAGE_NOT_FOUND');
    Object.assign(doc.stages[idx], patch);
    doc.stages.sort((a, b) => a.order - b.order);
    await doc.save();
    return doc.toJSON() as unknown as IPipeline;
  },

  async deleteStage(organizationId: string, pipelineId: string, stageId: string): Promise<IPipeline> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    const stage = doc.stages.find(s => s.id === stageId);
    if (!stage) throw new ApiError(404, 'Stage not found', 'STAGE_NOT_FOUND');
    if (stage.isWon || stage.isLost) throw new ApiError(400, 'Cannot delete Won or Lost stages', 'PROTECTED_STAGE');
    doc.stages = doc.stages.filter(s => s.id !== stageId) as typeof doc.stages;
    await doc.save();
    return doc.toJSON() as unknown as IPipeline;
  },

  async reorderStages(organizationId: string, pipelineId: string, orderedIds: string[]): Promise<IPipeline> {
    const doc = await PipelineModel.findOne({ _id: pipelineId, organizationId });
    if (!doc) throw new ApiError(404, 'Pipeline not found', 'PIPELINE_NOT_FOUND');
    orderedIds.forEach((id, idx) => {
      const s = doc.stages.find(st => st.id === id);
      if (s) s.order = idx;
    });
    doc.stages.sort((a, b) => a.order - b.order);
    await doc.save();
    return doc.toJSON() as unknown as IPipeline;
  },

  /** Seed the default pipeline for a new organization. */
  async seedDefault(organizationId: string): Promise<IPipeline> {
    const existing = await PipelineModel.findOne({ organizationId, isDefault: true });
    if (existing) return existing.toJSON() as unknown as IPipeline;
    const doc = await PipelineModel.create({
      organizationId,
      name:      'Sales Pipeline',
      stages:    defaultPipelineStages(),
      isDefault: true,
    });
    return doc.toJSON() as unknown as IPipeline;
  },
};
