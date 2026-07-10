/**
 * PromptService.ts — Versioned prompt template CRUD + rendering.
 */

import { PromptTemplateModel, IPromptTemplate } from '../../models/PromptTemplate.model';
import { ApiError } from '../../middleware/errorHandler';

const VAR_RE = /\{\{([^}]+)\}\}/g;

function extractVars(text: string): string[] {
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(text)) !== null) vars.add(m[1].trim());
  return [...vars];
}

function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
    const v = vars[k.trim()];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

export const PromptService = {

  async list(organizationId: string, agentId?: string): Promise<IPromptTemplate[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (agentId) filter.agentId = agentId;
    const docs = await PromptTemplateModel.find(filter).sort({ name: 1 });
    return docs.map(d => d.toJSON() as unknown as IPromptTemplate);
  },

  async getById(organizationId: string, id: string): Promise<IPromptTemplate> {
    const doc = await PromptTemplateModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Prompt template not found', 'PROMPT_NOT_FOUND');
    return doc.toJSON() as unknown as IPromptTemplate;
  },

  async create(organizationId: string, userId: string, data: Partial<IPromptTemplate>): Promise<IPromptTemplate> {
    const vars = extractVars(data.content ?? '');
    const doc  = await PromptTemplateModel.create({
      ...data, organizationId, createdById: userId, variables: vars,
      currentVersion: 1,
      versionHistory: [{ version: 1, content: data.content ?? '', variables: vars, savedAt: new Date(), savedById: userId }],
    });
    return doc.toJSON() as unknown as IPromptTemplate;
  },

  async update(organizationId: string, id: string, userId: string, data: Partial<IPromptTemplate>): Promise<IPromptTemplate> {
    const existing = await PromptTemplateModel.findOne({ _id: id, organizationId });
    if (!existing) throw new ApiError(404, 'Prompt template not found', 'PROMPT_NOT_FOUND');

    const newVersion = existing.currentVersion + 1;
    const vars       = extractVars(data.content ?? existing.content);
    const history    = [...(existing.versionHistory as any[]),
      { version: newVersion, content: data.content ?? existing.content, variables: vars, savedAt: new Date(), savedById: userId }
    ].slice(-10);

    const doc = await PromptTemplateModel.findByIdAndUpdate(
      id, { ...data, variables: vars, currentVersion: newVersion, versionHistory: history }, { new: true }
    );
    return doc!.toJSON() as unknown as IPromptTemplate;
  },

  async rollback(organizationId: string, id: string, version: number): Promise<IPromptTemplate> {
    const existing = await PromptTemplateModel.findOne({ _id: id, organizationId });
    if (!existing) throw new ApiError(404, 'Prompt template not found', 'PROMPT_NOT_FOUND');
    const hist    = (existing.versionHistory as any[]).find(v => v.version === version);
    if (!hist) throw new ApiError(404, 'Version not found', 'VERSION_NOT_FOUND');
    const doc = await PromptTemplateModel.findByIdAndUpdate(id, { content: hist.content, currentVersion: version }, { new: true });
    return doc!.toJSON() as unknown as IPromptTemplate;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await PromptTemplateModel.findOneAndDelete({ _id: id, organizationId });
  },

  async render(organizationId: string, id: string, vars: Record<string, unknown>): Promise<string> {
    const tmpl = await PromptService.getById(organizationId, id);
    return render(tmpl.content, vars);
  },

  renderInline: render,
};
