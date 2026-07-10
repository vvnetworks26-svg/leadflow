/**
 * automation/types.ts
 *
 * All shared types for the automation engine.
 * Single source of truth — every other module imports from here.
 */

// ─── Trigger types ────────────────────────────────────────────────────────────

export type TriggerType =
  | 'lead_created'        | 'lead_updated'        | 'lead_qualified'
  | 'lead_lost'           | 'lead_won'            | 'conversation_started'
  | 'conversation_completed'                       | 'booking_created'
  | 'booking_cancelled'   | 'booking_completed'   | 'task_created'
  | 'task_overdue'        | 'invoice_created'     | 'invoice_paid'
  | 'payment_failed'      | 'subscription_started'| 'subscription_cancelled'
  | 'user_registered'     | 'tag_added'           | 'webhook_received'
  | 'schedule'            | 'manual'              | 'api_trigger'
  | 'custom_event';

// ─── Condition operators ──────────────────────────────────────────────────────

export type ConditionOperator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'greater_than' | 'less_than' | 'between'
  | 'regex' | 'exists' | 'is_empty' | 'starts_with' | 'ends_with';

export type ConditionLogic = 'AND' | 'OR';

export interface Condition {
  id:       string;
  field:    string;           // dot-notation path e.g. 'lead.score', 'lead.status'
  operator: ConditionOperator;
  value:    unknown;          // string | number | string[] | { min, max } for between
  value2?:  unknown;          // for 'between' upper bound
}

export interface ConditionGroup {
  id:     string;
  logic:  ConditionLogic;
  conditions:  Condition[];
  groups?:     ConditionGroup[];   // nested groups for complex logic
}

// ─── Action types ─────────────────────────────────────────────────────────────

export type ActionType =
  | 'create_lead'        | 'update_lead'         | 'assign_owner'
  | 'move_pipeline_stage'| 'create_task'         | 'complete_task'
  | 'create_note'        | 'send_email'          | 'send_sms'
  | 'notify_user'        | 'create_booking'      | 'cancel_booking'
  | 'ai_summarize'       | 'ai_email'            | 'ai_proposal'
  | 'ai_score_lead'      | 'ai_classify_urgency' | 'ai_suggest_stage'
  | 'create_invoice'     | 'apply_tag'           | 'remove_tag'
  | 'webhook'            | 'http_request'        | 'slack_message'
  | 'teams_message'      | 'discord_message'     | 'wait'
  | 'delay'              | 'branch'              | 'custom_code';

// ─── Step node (action or branch in the workflow graph) ──────────────────────

export interface WorkflowStep {
  id:           string;
  type:         ActionType;
  name:         string;
  params:       Record<string, unknown>;
  conditions?:  ConditionGroup;         // guard conditions for this step
  onSuccess?:   string;                 // next step id
  onFailure?:   string;                 // fallback step id
  retryPolicy?: RetryPolicy;
  timeout?:     number;                 // seconds
}

// ─── Branch node ─────────────────────────────────────────────────────────────

export interface BranchNode {
  id:       string;
  type:     'branch';
  name:     string;
  branches: Array<{
    id:         string;
    label:      string;
    conditions: ConditionGroup;
    nextStepId: string;
  }>;
  defaultNextStepId?: string;
}

// ─── Delay config ─────────────────────────────────────────────────────────────

export type DelayUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'business_days';

export interface DelayConfig {
  unit:            DelayUnit;
  amount:          number;
  untilDate?:      string;          // ISO date string
  untilBusinessHours?: boolean;     // wait until next business hours window
  untilCondition?: ConditionGroup;  // wait until condition is true
}

// ─── Retry policy ─────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts:    number;
  backoffType:    'fixed' | 'exponential';
  delaySeconds:   number;
}

// ─── Trigger config ───────────────────────────────────────────────────────────

export interface TriggerConfig {
  type:       TriggerType;
  filters?:   ConditionGroup;          // filter which events trigger this
  schedule?:  string;                  // cron expression for 'schedule' type
  webhookId?: string;                  // for 'webhook_received' type
  eventName?: string;                  // for 'custom_event' type
}

// ─── Execution status ─────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'pending' | 'running' | 'completed' | 'failed'
  | 'cancelled' | 'retrying' | 'timeout' | 'waiting';

// ─── Variable types ───────────────────────────────────────────────────────────

export type VariableScope =
  | 'lead' | 'company' | 'contact' | 'conversation' | 'booking'
  | 'invoice' | 'payment' | 'organization' | 'current_user'
  | 'current_date' | 'current_time' | 'ai_summary' | 'custom';

export interface WorkflowVariable {
  key:          string;
  scope:        VariableScope;
  path?:        string;            // dot-path within the scope object
  defaultValue: unknown;
  description?: string;
}

// ─── Execution context ────────────────────────────────────────────────────────

export interface ExecutionContext {
  organizationId: string;
  workflowId:     string;
  executionId:    string;
  triggerType:    TriggerType;
  triggerData:    Record<string, unknown>;    // raw trigger payload
  variables:      Record<string, unknown>;   // resolved variable values
  currentStepId?: string;
  attempt:        number;
}
