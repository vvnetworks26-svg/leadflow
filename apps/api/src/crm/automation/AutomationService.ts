/**
 * AutomationService.ts
 *
 * Rules engine for CRM automation.
 * Trigger events fire synchronously from services.
 * Actions execute asynchronously (fire-and-forget — never block the main flow).
 *
 * Supported triggers: lead_created, stage_changed, booking_made,
 *   lead_lost, lead_won, invoice_paid, task_overdue, tag_added, score_threshold
 *
 * Supported actions: assign_owner, create_task, send_notification,
 *   notify_team, update_score, move_stage, add_tag, remove_tag
 */

import {
  AutomationRuleModel,
  AutomationTrigger,
  AutomationAction,
} from '../../models/AutomationRule.model';
import { LeadModel }         from '../../models/Lead.model';
import { TaskModel }         from '../../models/Task.model';
import { NotificationModel } from '../../models/Notification.model';
import { TagModel }          from '../../models/Tag.model';
import { logger }            from '../../utils/logger';

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  action:         AutomationAction,
  organizationId: string,
  leadId?:        string,
  context?:       Record<string, unknown>,
): Promise<void> {
  try {
    switch (action.type) {

      case 'assign_owner': {
        if (!leadId) break;
        const ownerId = String(action.params.ownerId ?? '');
        if (ownerId) await LeadModel.findOneAndUpdate({ _id: leadId, organizationId }, { ownerId });
        break;
      }

      case 'create_task': {
        if (!leadId) break;
        await TaskModel.create({
          organizationId,
          leadId,
          title:       String(action.params.title    ?? 'Automated task'),
          description: String(action.params.description ?? ''),
          type:        action.params.type   ?? 'Follow-up',
          priority:    action.params.priority ?? 'Medium',
          ownerId:     action.params.ownerId  ?? null,
          dueDate:     action.params.dueDaysFromNow
            ? new Date(Date.now() + Number(action.params.dueDaysFromNow) * 86400_000)
            : null,
        });
        break;
      }

      case 'send_notification':
      case 'notify_team': {
        const userId = String(action.params.userId ?? action.params.ownerId ?? '');
        if (!userId) break;
        await NotificationModel.create({
          organizationId,
          userId,
          type:    'info',
          title:   String(action.params.title   ?? 'CRM Automation'),
          message: String(action.params.message ?? `Automation triggered: ${context?.trigger ?? ''}`),
        });
        break;
      }

      case 'update_score': {
        if (!leadId) break;
        const delta = Number(action.params.delta ?? 0);
        await LeadModel.findOneAndUpdate(
          { _id: leadId, organizationId },
          { $inc: { score: delta } }
        );
        break;
      }

      case 'move_stage': {
        if (!leadId) break;
        await LeadModel.findOneAndUpdate(
          { _id: leadId, organizationId },
          {
            stageId:   action.params.stageId   ?? null,
            stageName: action.params.stageName ?? null,
          }
        );
        break;
      }

      case 'add_tag': {
        if (!leadId) break;
        const tag = String(action.params.tag ?? '');
        if (tag) {
          await LeadModel.findOneAndUpdate(
            { _id: leadId, organizationId },
            { $addToSet: { tags: tag } }
          );
          await TagModel.findOneAndUpdate(
            { organizationId, name: tag },
            { $inc: { usageCount: 1 } }
          );
        }
        break;
      }

      case 'remove_tag': {
        if (!leadId) break;
        const tag = String(action.params.tag ?? '');
        if (tag) await LeadModel.findOneAndUpdate(
          { _id: leadId, organizationId },
          { $pull: { tags: tag } }
        );
        break;
      }
    }
  } catch (err) {
    logger.warn({ err, action: action.type }, '[Automation] Action failed');
  }
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateConditions(
  conditions: Record<string, unknown>,
  context:    Record<string, unknown>,
): boolean {
  if (Object.keys(conditions).length === 0) return true;
  for (const [key, expected] of Object.entries(conditions)) {
    const actual = context[key];
    if (actual !== expected) return false;
  }
  return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const AutomationService = {

  /**
   * Fire a trigger event. Called from LeadService and other services.
   * Runs asynchronously — never blocks the caller.
   */
  fire(
    trigger:        AutomationTrigger,
    organizationId: string,
    leadId?:        string,
    context:        Record<string, unknown> = {},
  ): void {
    // Intentionally not awaited — fire-and-forget
    AutomationService._run(trigger, organizationId, leadId, context).catch(err => {
      logger.warn({ err, trigger }, '[Automation] Runner error');
    });
  },

  async _run(
    trigger:        AutomationTrigger,
    organizationId: string,
    leadId?:        string,
    context:        Record<string, unknown> = {},
  ): Promise<void> {
    const rules = await AutomationRuleModel.find({ organizationId, trigger, isActive: true });
    for (const rule of rules) {
      if (!evaluateConditions(rule.conditions as Record<string, unknown>, { ...context, trigger })) continue;
      for (const action of rule.actions) {
        await executeAction(action, organizationId, leadId, { ...context, trigger });
      }
      await AutomationRuleModel.findByIdAndUpdate(rule._id, {
        $inc: { runCount: 1 },
        lastRunAt: new Date(),
      });
    }
  },

  // ── CRUD for rules ─────────────────────────────────────────────────────────

  async list(organizationId: string) {
    return AutomationRuleModel.find({ organizationId }).sort({ createdAt: -1 }).lean();
  },

  async getById(organizationId: string, id: string) {
    const doc = await AutomationRuleModel.findOne({ _id: id, organizationId });
    if (!doc) throw new Error('Automation rule not found');
    return doc.toJSON();
  },

  async create(organizationId: string, data: {
    name:       string;
    description?:string;
    trigger:    AutomationTrigger;
    conditions?:Record<string, unknown>;
    actions:    AutomationAction[];
  }) {
    const doc = await AutomationRuleModel.create({ ...data, organizationId });
    return doc.toJSON();
  },

  async update(organizationId: string, id: string, patch: Record<string, unknown>) {
    const doc = await AutomationRuleModel.findOneAndUpdate(
      { _id: id, organizationId }, patch, { new: true }
    );
    if (!doc) throw new Error('Automation rule not found');
    return doc.toJSON();
  },

  async delete(organizationId: string, id: string): Promise<void> {
    await AutomationRuleModel.findOneAndDelete({ _id: id, organizationId });
  },

  async toggle(organizationId: string, id: string, isActive: boolean) {
    const doc = await AutomationRuleModel.findOneAndUpdate(
      { _id: id, organizationId }, { isActive }, { new: true }
    );
    if (!doc) throw new Error('Automation rule not found');
    return doc.toJSON();
  },
};
