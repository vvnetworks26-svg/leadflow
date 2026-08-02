/**
 * conversation-engine/schemas.ts
 *
 * Zod validation schemas for the Conversation Orchestration Engine.
 * Blueprints and rules must pass these schemas at load time.
 * Invalid configuration is rejected before a single conversation runs.
 */

import { z } from 'zod';

export const ConversationObjectiveSchema = z.enum([
  'build_rapport', 'clarify_intent',
  'collect_name', 'collect_phone', 'collect_address', 'collect_email',
  'collect_budget', 'collect_timeline', 'collect_service_details',
  'resolve_objection', 'answer_question',
  'offer_recommendation', 'offer_appointment', 'confirm_appointment',
  'escalate_to_human', 'complete_conversation',
  'handle_emergency', 'handle_complaint', 'handle_existing_appointment',
  'provide_estimate', 'handle_billing', 'handle_employment',
  'collect_emergency_details',
]);

export const WorkflowStateSchema = z.enum([
  'initialising', 'collecting_info', 'awaiting_confirmation',
  'booking_in_progress', 'objection_handling', 'emergency_dispatch',
  'escalating', 'completed', 'recovery',
]);

export const QuestionTypeSchema = z.enum([
  'open', 'yes_no', 'multiple_choice', 'date_time',
  'phone', 'address', 'name', 'free_text',
]);

export const AllowedToolSchema = z.enum([
  'check_availability', 'book_appointment', 'lookup_faq',
  'get_estimate', 'send_sms', 'send_email', 'create_lead', 'escalate',
]);

export const RuleTriggerSchema = z.enum([
  'urgency_critical', 'urgency_emergency', 'customer_wants_human',
  'business_closed', 'intent_complaint', 'intent_billing',
  'confidence_low', 'repeated_failure', 'booking_confirmed',
]);

export const RuleActionSchema = z.enum([
  'escalate_immediately', 'skip_to_booking', 'skip_qualification',
  'offer_next_slot', 'set_objective', 'complete', 'restart',
]);

export const BusinessRuleSchema = z.object({
  id:              z.string().min(1),
  trigger:         RuleTriggerSchema,
  action:          RuleActionSchema,
  targetObjective: ConversationObjectiveSchema.optional(),
  priority:        z.number().int().min(0).default(0),
  enabled:         z.boolean().default(true),
});

export const RecoveryStrategySchema = z.object({
  onAmbiguity:     ConversationObjectiveSchema.default('clarify_intent'),
  onRepeat:        ConversationObjectiveSchema.default('clarify_intent'),
  onContradiction: ConversationObjectiveSchema.default('clarify_intent'),
  onTopicChange:   ConversationObjectiveSchema.default('build_rapport'),
  preserveContext: z.boolean().default(true),
});

export const BlueprintTransitionSchema = z.object({
  condition: z.string().min(1),
  targetId:  z.string().min(1),
  priority:  z.number().int().min(0).default(0),
});

export const BlueprintStageSchema = z.object({
  id:                 z.string().min(1),
  objective:          ConversationObjectiveSchema,
  requiredFields:     z.array(z.string()).default([]),
  optionalFields:     z.array(z.string()).default([]),
  completionCriteria: z.array(z.string()).default([]),
  allowedTools:       z.array(AllowedToolSchema).default([]),
  transitions:        z.array(BlueprintTransitionSchema).default([]),
  recoveryStrategy:   RecoveryStrategySchema.default({}),
  skipWhen:           z.array(z.string()).default([]),
  exitConditions:     z.array(z.string()).default([]),
});

export const BranchDefinitionSchema = z.object({
  id:          z.string().min(1),
  condition:   z.string().min(1),
  blueprintId: z.string().min(1),
  priority:    z.number().int().min(0).default(0),
});

export const ConversationBlueprintSchema = z.object({
  id:             z.string().min(1),
  name:           z.string().min(1).max(100),
  industry:       z.string().min(1),
  intentCategory: z.string().min(1),
  stages:         z.array(BlueprintStageSchema).min(1),
  defaultStageId: z.string().min(1),
  rules:          z.array(BusinessRuleSchema).default([]),
  branches:       z.array(BranchDefinitionSchema).default([]),
  metadata: z.object({
    version:   z.string().default('1.0.0'),
    createdAt: z.string().default(() => new Date().toISOString()),
    updatedAt: z.string().default(() => new Date().toISOString()),
    tags:      z.array(z.string()).default([]),
  }).default({}),
}).refine(
  bp => bp.stages.some(s => s.id === bp.defaultStageId),
  { message: 'defaultStageId must match a stage id' }
);

export type ConversationBlueprintInput = z.input<typeof ConversationBlueprintSchema>;
