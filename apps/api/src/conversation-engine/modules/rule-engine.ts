/**
 * Rule Engine — evaluates business rules and returns the highest-priority override.
 * Rules fire before any objective selection. Pure function. No LLM.
 *
 * BUG-M3 FIX: `nowMs` is now injectable via RuleContext.
 * Defaults to Date.now() so production code requires no changes.
 * Tests can pass a fixed timestamp to test business_closed rule deterministically.
 */
import type {
  BusinessRule, ConversationObjective, WorkflowState,
} from '../types';
import type { UrgencyLevel, IntentCategory } from '../../intent-engine/types';
import type { RichConversationMemory }        from '../../ai/types';
import { isOpen }                             from '../../business-identity/modules/business-hours.module';
import type { BusinessHours }                 from '../../business-identity/types';

export interface RuleContext {
  memory:       RichConversationMemory;
  urgency:      UrgencyLevel;
  intent:       IntentCategory;
  requiresHuman:boolean;
  businessHours:BusinessHours;
  timezone:     string;
  rules:        readonly BusinessRule[];
  /** Injectable clock — defaults to Date.now() (BUG-M3 fix) */
  nowMs?:       number;
}

export interface RuleResult {
  fired:        boolean;
  ruleId:       string | null;
  targetObjective: ConversationObjective | null;
  targetState:  WorkflowState | null;
  reason:       string;
}

export function evaluateRules(ctx: RuleContext): RuleResult {
  // Sort by priority descending — highest wins
  const sorted = [...ctx.rules]
    .filter(r => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    const fired = testTrigger(rule, ctx);
    if (!fired) continue;

    const obj = applyAction(rule);
    return {
      fired:    true,
      ruleId:   rule.id,
      targetObjective: obj.objective,
      targetState:     obj.state,
      reason:   `Rule "${rule.id}" fired (trigger=${rule.trigger}, action=${rule.action})`,
    };
  }

  return { fired: false, ruleId: null, targetObjective: null, targetState: null, reason: '' };
}

// ─── Trigger evaluators ───────────────────────────────────────────────────────

function testTrigger(rule: BusinessRule, ctx: RuleContext): boolean {
  switch (rule.trigger) {
    case 'urgency_critical':       return ctx.urgency === 'critical';
    case 'urgency_emergency':      return ctx.urgency === 'emergency';
    case 'customer_wants_human':   return ctx.requiresHuman || ctx.intent === 'human_representative';
    case 'business_closed':        return !isOpen(ctx.businessHours, ctx.timezone, ctx.nowMs !== undefined ? new Date(ctx.nowMs) : new Date());
    case 'intent_complaint':       return ctx.intent === 'complaint';
    case 'intent_billing':         return ctx.intent === 'billing_question';
    case 'confidence_low':         return false;   // evaluated externally
    case 'repeated_failure':       return false;   // evaluated externally
    case 'booking_confirmed':      return ctx.memory.bookingStatus === 'booked';
    default:                       return false;
  }
}

function applyAction(rule: BusinessRule): { objective: ConversationObjective | null; state: WorkflowState | null } {
  switch (rule.action) {
    case 'escalate_immediately': return { objective: rule.targetObjective ?? 'escalate_to_human', state: 'escalating' };
    case 'skip_to_booking':      return { objective: rule.targetObjective ?? 'handle_emergency',  state: 'emergency_dispatch' };
    case 'skip_qualification':   return { objective: rule.targetObjective ?? 'offer_appointment', state: 'booking_in_progress' };
    case 'offer_next_slot':      return { objective: rule.targetObjective ?? 'offer_appointment', state: 'booking_in_progress' };
    case 'set_objective':        return { objective: rule.targetObjective ?? null,                state: null };
    case 'complete':             return { objective: 'complete_conversation',                      state: 'completed' };
    case 'restart':              return { objective: 'build_rapport',                              state: 'initialising' };
    default:                     return { objective: null,                                         state: null };
  }
}
