/**
 * WorkflowTemplateService.ts
 *
 * Manages workflow templates. System templates are seeded once at startup.
 * Users can create workflows from templates (clones the structure).
 */

import { randomUUID }            from 'crypto';
import { WorkflowTemplateModel } from '../../models/WorkflowTemplate.model';
import { WorkflowModel }         from '../../models/Workflow.model';
import type { IWorkflowTemplate } from '../../models/WorkflowTemplate.model';

// ─── Default system templates ─────────────────────────────────────────────────

const SYSTEM_TEMPLATES: Omit<IWorkflowTemplate, 'id' | 'createdAt' | 'usageCount'>[] = [
  {
    name:        'New Lead Follow-up',
    description: 'Automatically follow up with new leads within minutes of capture.',
    category:    'Lead Nurturing',
    isSystem:    true,
    tags:        ['leads', 'follow-up', 'automation'],
    trigger:     { type: 'lead_created' },
    steps: [
      { id: 's1', type: 'wait',         name: 'Wait 5 min',      params: { unit: 'minutes', amount: 5 }, onSuccess: 's2' },
      { id: 's2', type: 'notify_user',  name: 'Notify Owner',    params: { title: 'New Lead: {{lead.name}}', message: 'A new lead just came in. Follow up now!', userId: '{{lead.ownerId}}' }, onSuccess: 's3' },
      { id: 's3', type: 'create_task',  name: 'Create Follow-up Task', params: { title: 'Follow up with {{lead.name}}', type: 'Call', priority: 'High', dueDaysFromNow: 1, leadId: '{{lead.id}}' } },
    ],

  },
  {
    name:        'Missed Booking Reminder',
    description: 'Notify the team and re-engage when a booking is cancelled.',
    category:    'Calendar',
    isSystem:    true,
    tags:        ['bookings', 'reminder'],
    trigger:     { type: 'booking_cancelled' },
    steps: [
      { id: 's1', type: 'notify_user',  name: 'Notify Assignee', params: { title: 'Booking Cancelled', message: 'Booking with {{booking.guestName}} was cancelled.', userId: '{{booking.assigneeId}}' }, onSuccess: 's2' },
      { id: 's2', type: 'create_task',  name: 'Re-engage Task',  params: { title: 'Re-engage {{booking.guestName}}', type: 'Email', priority: 'Medium', dueDaysFromNow: 1 } },
    ],

  },
  {
    name:        'Proposal Follow-up',
    description: 'Follow up 2 days after a proposal is sent with an AI-generated email.',
    category:    'Sales',
    isSystem:    true,
    tags:        ['proposal', 'follow-up', 'ai'],
    trigger:     { type: 'lead_updated', filters: { id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: 'status', operator: 'equals', value: 'Proposal' }] } },
    steps: [
      { id: 's1', type: 'wait',         name: 'Wait 2 days',     params: { unit: 'days', amount: 2 }, onSuccess: 's2' },
      { id: 's2', type: 'ai_email',     name: 'Generate Email',  params: { subject: 'Following up on our proposal', tone: 'professional', leadId: '{{lead.id}}' }, onSuccess: 's3' },
      { id: 's3', type: 'create_task',  name: 'Send Follow-up',  params: { title: 'Send follow-up email to {{lead.name}}', type: 'Email', priority: 'High', leadId: '{{lead.id}}' } },
    ],

  },
  {
    name:        'Lead Qualification Scoring',
    description: 'Automatically score and route leads using AI when they are qualified.',
    category:    'Lead Scoring',
    isSystem:    true,
    tags:        ['ai', 'scoring', 'routing'],
    trigger:     { type: 'lead_qualified' },
    steps: [
      { id: 's1', type: 'ai_score_lead',      name: 'Score Lead',       params: { leadId: '{{lead.id}}' }, onSuccess: 's2' },
      { id: 's2', type: 'ai_summarize',        name: 'AI Summary',      params: { leadId: '{{lead.id}}' }, onSuccess: 's3' },
      { id: 's3', type: 'move_pipeline_stage', name: 'Move to Qualified', params: { leadId: '{{lead.id}}', stageName: 'Qualified', stageId: 'stage_qualified' } },
    ],

  },
  {
    name:        'Re-engagement Campaign',
    description: 'Automatically re-engage cold leads with an AI-written email.',
    category:    'Lead Nurturing',
    isSystem:    true,
    tags:        ['cold-leads', 're-engagement', 'ai'],
    trigger:     { type: 'lead_updated', filters: { id: 'g1', logic: 'AND', conditions: [{ id: 'c1', field: 'temperature', operator: 'equals', value: 'Cold' }] } },
    steps: [
      { id: 's1', type: 'wait',       name: 'Wait 3 days', params: { unit: 'days', amount: 3 }, onSuccess: 's2' },
      { id: 's2', type: 'ai_email',   name: 'Re-engagement Email', params: { subject: 'Still thinking about it?', tone: 'friendly', leadId: '{{lead.id}}' }, onSuccess: 's3' },
      { id: 's3', type: 'apply_tag',  name: 'Tag as Re-engaged',  params: { leadId: '{{lead.id}}', tag: 're-engaged' } },
    ],

  },
  {
    name:        'Appointment Confirmation',
    description: 'Send a confirmation notification when a booking is created.',
    category:    'Calendar',
    isSystem:    true,
    tags:        ['bookings', 'confirmation'],
    trigger:     { type: 'booking_created' },
    steps: [
      { id: 's1', type: 'notify_user', name: 'Notify Host', params: { title: 'New Booking Confirmed', message: '{{booking.guestName}} booked {{booking.meetingTypeName}} at {{booking.startUtc}}', userId: '{{booking.assigneeId}}' } },
    ],

  },
  {
    name:        'Won Deal Celebration',
    description: 'Notify the team and update the CRM when a deal is won.',
    category:    'Sales',
    isSystem:    true,
    tags:        ['won', 'deal', 'crm'],
    trigger:     { type: 'lead_won' },
    steps: [
      { id: 's1', type: 'apply_tag',    name: 'Tag as Customer', params: { leadId: '{{lead.id}}', tag: 'customer' }, onSuccess: 's2' },
      { id: 's2', type: 'notify_user',  name: 'Notify Team',     params: { title: '🎉 Deal Won!', message: '{{lead.name}} closed! Value: ${{lead.value}}', userId: '{{lead.ownerId}}' }, onSuccess: 's3' },
      { id: 's3', type: 'ai_summarize', name: 'Win Summary',     params: { leadId: '{{lead.id}}' } },
    ],

  },
  {
    name:        'Task Overdue Alert',
    description: 'Alert the owner and escalate when a task becomes overdue.',
    category:    'Tasks',
    isSystem:    true,
    tags:        ['tasks', 'overdue', 'alert'],
    trigger:     { type: 'task_overdue' },
    steps: [
      { id: 's1', type: 'notify_user', name: 'Alert Owner', params: { title: 'Task Overdue: {{task.title}}', message: 'Your task is overdue. Please complete it immediately.', userId: '{{task.ownerId}}' } },
    ],

  },
  {
    name:        'Customer Onboarding',
    description: 'Multi-step onboarding sequence when a new customer is added.',
    category:    'Onboarding',
    isSystem:    true,
    tags:        ['onboarding', 'customer', 'sequence'],
    trigger:     { type: 'lead_won' },
    steps: [
      { id: 's1', type: 'create_task',  name: 'Onboarding Call',      params: { title: 'Schedule onboarding call with {{lead.name}}', type: 'Call', priority: 'High', dueDaysFromNow: 1, leadId: '{{lead.id}}' }, onSuccess: 's2' },
      { id: 's2', type: 'apply_tag',    name: 'Tag Onboarding',       params: { leadId: '{{lead.id}}', tag: 'onboarding' }, onSuccess: 's3' },
      { id: 's3', type: 'wait',         name: 'Wait 3 Days',          params: { unit: 'days', amount: 3 }, onSuccess: 's4' },
      { id: 's4', type: 'create_task',  name: 'Check-in Task',        params: { title: 'Check in with {{lead.name}}', type: 'Email', priority: 'Medium', leadId: '{{lead.id}}' } },
    ],

  },
  {
    name:        'Upsell Campaign',
    description: 'Identify upsell opportunities for existing customers.',
    category:    'Revenue',
    isSystem:    true,
    tags:        ['upsell', 'revenue', 'customers'],
    trigger:     { type: 'invoice_paid' },
    steps: [
      { id: 's1', type: 'wait',        name: 'Wait 7 Days', params: { unit: 'days', amount: 7 }, onSuccess: 's2' },
      { id: 's2', type: 'ai_email',    name: 'Upsell Email', params: { subject: 'Unlock even more with {{organization.name}}', tone: 'consultative' }, onSuccess: 's3' },
      { id: 's3', type: 'apply_tag',   name: 'Tag Upsell',  params: { tag: 'upsell-candidate' } },
    ],

  },
];

export const WorkflowTemplateService = {

  async list(): Promise<IWorkflowTemplate[]> {
    const docs = await WorkflowTemplateModel.find().sort({ category: 1, name: 1 });
    return docs.map(d => d.toJSON() as unknown as IWorkflowTemplate);
  },

  async getById(id: string): Promise<IWorkflowTemplate | null> {
    const doc = await WorkflowTemplateModel.findById(id);
    return doc ? (doc.toJSON() as unknown as IWorkflowTemplate) : null;
  },

  /** Create a workflow from a template for a specific organization. */
  async createFromTemplate(
    templateId:     string,
    organizationId: string,
    userId:         string,
    name?:          string,
  ): Promise<string> {
    const template = await WorkflowTemplateModel.findById(templateId);
    if (!template) throw new Error('Template not found');

    const workflow = await WorkflowModel.create({
      organizationId,
      name:           name ?? template.name,
      description:    template.description,
      status:         'draft',
      trigger:        template.trigger,
      steps:          template.steps,
      variables:      [],
      currentVersion: 1,
      createdById:    userId,
      updatedById:    userId,
    });

    await WorkflowTemplateModel.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } });

    return workflow._id.toString();
  },

  /** Seed system templates (idempotent — skips if already seeded). */
  async seedSystemTemplates(): Promise<void> {
    const existing = await WorkflowTemplateModel.countDocuments({ isSystem: true });
    if (existing >= SYSTEM_TEMPLATES.length) return;

    for (const tmpl of SYSTEM_TEMPLATES) {
      await WorkflowTemplateModel.findOneAndUpdate(
        { name: tmpl.name, isSystem: true },
        { $setOnInsert: tmpl },
        { upsert: true }
      );
    }
  },
};
