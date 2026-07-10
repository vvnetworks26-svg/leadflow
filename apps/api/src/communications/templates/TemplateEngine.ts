/**
 * TemplateEngine.ts — Variable substitution + template CRUD + versioning.
 */

import { CommunicationTemplateModel, ICommunicationTemplate } from '../../models/CommunicationTemplate.model';
import { ApiError }  from '../../middleware/errorHandler';
import type { ThreadChannel } from '../../models/ConversationThread.model';

const VAR_RE = /\{\{([^}]+)\}\}/g;

/** Extract all {{variable}} names from a template string. */
export function extractVariables(text: string): string[] {
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(text)) !== null) vars.add(m[1].trim());
  return [...vars];
}

/** Render a template string with provided variable values. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = vars[key.trim()];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

export const TemplateEngine = {

  async list(organizationId: string, channel?: ThreadChannel): Promise<ICommunicationTemplate[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (channel) filter.channel = channel;
    const docs = await CommunicationTemplateModel.find(filter).sort({ name: 1 });
    return docs.map(d => d.toJSON() as unknown as ICommunicationTemplate);
  },

  async getById(organizationId: string, id: string): Promise<ICommunicationTemplate> {
    const doc = await CommunicationTemplateModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Template not found', 'TEMPLATE_NOT_FOUND');
    return doc.toJSON() as unknown as ICommunicationTemplate;
  },

  async create(organizationId: string, userId: string, data: Partial<ICommunicationTemplate>): Promise<ICommunicationTemplate> {
    const body    = (data.body ?? '') + (data.bodyHtml ?? '');
    const vars    = extractVariables(body + (data.subject ?? ''));
    const doc = await CommunicationTemplateModel.create({
      ...data, organizationId, createdById: userId,
      variables: vars, currentVersion: 1,
      versionHistory: [{ version: 1, subject: data.subject ?? '', body: data.body ?? '', bodyHtml: data.bodyHtml ?? '', savedAt: new Date() }],
    });
    return doc.toJSON() as unknown as ICommunicationTemplate;
  },

  async update(organizationId: string, id: string, data: Partial<ICommunicationTemplate>): Promise<ICommunicationTemplate> {
    const doc = await CommunicationTemplateModel.findOne({ _id: id, organizationId });
    if (!doc) throw new ApiError(404, 'Template not found', 'TEMPLATE_NOT_FOUND');

    const nextVersion = doc.currentVersion + 1;
    const vars        = extractVariables((data.body ?? doc.body) + (data.bodyHtml ?? doc.bodyHtml) + (data.subject ?? doc.subject));

    const history = [...(doc.versionHistory as any[]),
      { version: nextVersion, subject: data.subject ?? doc.subject, body: data.body ?? doc.body, bodyHtml: data.bodyHtml ?? doc.bodyHtml, savedAt: new Date() }
    ].slice(-10);  // keep last 10 versions

    const updated = await CommunicationTemplateModel.findByIdAndUpdate(
      id,
      { ...data, variables: vars, currentVersion: nextVersion, versionHistory: history, $inc: { } },
      { new: true }
    );
    return updated!.toJSON() as unknown as ICommunicationTemplate;
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await CommunicationTemplateModel.findOneAndDelete({ _id: id, organizationId });
  },

  /** Render a template with context variables — returns subject+body+bodyHtml. */
  async render(organizationId: string, id: string, vars: Record<string, unknown>): Promise<{ subject: string; body: string; bodyHtml: string }> {
    const tmpl = await TemplateEngine.getById(organizationId, id);
    return {
      subject:  renderTemplate(tmpl.subject, vars),
      body:     renderTemplate(tmpl.body, vars),
      bodyHtml: renderTemplate(tmpl.bodyHtml, vars),
    };
  },
};
