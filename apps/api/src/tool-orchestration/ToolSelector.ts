/**
 * tool-orchestration/ToolSelector.ts
 *
 * Layer 7 — Pure Tool Selector.
 *
 * Deterministically decides WHICH tools to run and in what order,
 * based solely on conversation context.
 *
 * Rules (evaluated in priority order):
 *   1. Emergency   → check_availability (if open hours) + escalate
 *   2. Booking     → check_availability + book_appointment (if data complete)
 *   3. FAQ         → lookup_faq
 *   4. Estimate    → get_estimate
 *   5. Lead upsert → create_lead / update_lead (after name+phone collected)
 *   6. Escalation  → escalate (human representative or repeated failure)
 *   7. SMS/Email   → send_sms / send_email on booking confirmation
 *
 * PURE FUNCTION — no I/O, no DB, no side effects.
 */

import type {
  ToolCall,
  ToolName,
  ToolOrchestrationPlan,
  ToolSelectionContext,
} from './types';

// ─── Guard helpers ────────────────────────────────────────────────────────────

function hasName(ctx: ToolSelectionContext): boolean {
  return !!(ctx.memory.visitorName || ctx.memory.rich?.visitorName?.value);
}

function hasPhone(ctx: ToolSelectionContext): boolean {
  return !!(ctx.memory.phone || ctx.memory.rich?.phone?.value);
}

function hasEmail(ctx: ToolSelectionContext): boolean {
  return !!(ctx.memory.email || ctx.memory.rich?.email?.value);
}

function hasContactInfo(ctx: ToolSelectionContext): boolean {
  return hasPhone(ctx) || hasEmail(ctx);
}

function isBookingReady(ctx: ToolSelectionContext): boolean {
  return hasName(ctx) && hasContactInfo(ctx) && ctx.memory.bookingStatus !== 'booked';
}

function isLeadWorthy(ctx: ToolSelectionContext): boolean {
  return hasName(ctx) && hasContactInfo(ctx);
}

function isEmergency(ctx: ToolSelectionContext): boolean {
  return ctx.intent.urgency === 'critical' || ctx.intent.urgency === 'emergency';
}

function isFaqIntent(ctx: ToolSelectionContext): boolean {
  return ['general_question', 'billing_question', 'warranty'].includes(ctx.intent.category);
}

function isEstimateIntent(ctx: ToolSelectionContext): boolean {
  return ['request_estimate', 'repair', 'installation', 'maintenance'].includes(ctx.intent.category);
}

function isBookingIntent(ctx: ToolSelectionContext): boolean {
  return (
    ctx.intent.category === 'book_appointment' ||
    ctx.stage === 'booking' ||
    ctx.workflowState === 'booking_in_progress'
  );
}

function isEscalationIntent(ctx: ToolSelectionContext): boolean {
  return (
    ctx.intent.category === 'human_representative' ||
    ctx.intent.requiresHuman ||
    ctx.workflowState === 'escalating'
  );
}

function needsLeadUpsert(ctx: ToolSelectionContext): boolean {
  // Create/update lead once we have minimum qualifying data.
  // Only after turn 1 to avoid noise from greetings.
  return isLeadWorthy(ctx) && ctx.turnCount >= 1;
}

function isBookingConfirmed(ctx: ToolSelectionContext): boolean {
  return ctx.memory.bookingStatus === 'booked';
}

// ─── Call builders ────────────────────────────────────────────────────────────

function checkAvailabilityCall(reason: string): ToolCall {
  return {
    tool:       'check_availability',
    params:     {},
    reason,
    priority:   'high',
    required:   false,
    idempotent: true,
  };
}

function bookAppointmentCall(ctx: ToolSelectionContext): ToolCall {
  const name  = (ctx.memory.visitorName as string)
             || (ctx.memory.rich?.visitorName?.value as string)
             || '';
  const phone = (ctx.memory.phone as string)
             || (ctx.memory.rich?.phone?.value as string)
             || '';
  const email = (ctx.memory.email as string)
             || (ctx.memory.rich?.email?.value as string)
             || '';

  return {
    tool:     'book_appointment',
    params:   {
      guestName:  name,
      guestEmail: email,
      guestPhone: phone,
      serviceType:ctx.memory.servicesDiscussed?.[0] ?? ctx.identity.servicesCatalog?.[0]?.name ?? '',
      notes:      ctx.memory.painPoints?.[0] ?? '',
    },
    reason:     'Booking stage reached with complete lead data',
    priority:   'critical',
    required:   true,
    idempotent: false,
  };
}

function createLeadCall(ctx: ToolSelectionContext): ToolCall {
  const name  = (ctx.memory.visitorName as string)
             || (ctx.memory.rich?.visitorName?.value as string)
             || '';
  const phone = (ctx.memory.phone as string)
             || (ctx.memory.rich?.phone?.value as string)
             || '';
  const email = (ctx.memory.email as string)
             || (ctx.memory.rich?.email?.value as string)
             || '';

  return {
    tool:       'create_lead',
    params:     {
      name,
      phone,
      email,
      company:    (ctx.memory.company as string) || undefined,
      service:    ctx.memory.servicesDiscussed?.[0] ?? '',
      painPoint:  ctx.memory.painPoints?.[0] ?? '',
      source:     'ai_chat',
    },
    reason:     'Minimum lead data collected — upsert to CRM',
    priority:   'high',
    required:   false,
    idempotent: true,
  };
}

function lookupFaqCall(ctx: ToolSelectionContext): ToolCall {
  return {
    tool:       'lookup_faq',
    params:     { query: ctx.userMessage },
    reason:     'User has a question — check FAQ knowledge base',
    priority:   'medium',
    required:   false,
    idempotent: true,
  };
}

function getEstimateCall(ctx: ToolSelectionContext): ToolCall {
  return {
    tool:       'get_estimate',
    params:     {
      service:   ctx.memory.servicesDiscussed?.[0]
                ?? ctx.intent.detectedService
                ?? '',
      industry:  ctx.identity.companyProfile?.industry ?? 'general',
    },
    reason:     'User requested a pricing estimate',
    priority:   'medium',
    required:   false,
    idempotent: true,
  };
}

function escalateCall(ctx: ToolSelectionContext): ToolCall {
  return {
    tool:       'escalate',
    params:     {
      reason:     ctx.intent.category === 'human_representative'
                    ? 'customer_requested'
                    : 'emergency',
      urgency:    ctx.intent.urgency,
    },
    reason:     'Escalation required — routing to human agent',
    priority:   'critical',
    required:   true,
    idempotent: true,
  };
}

function sendSmsCall(ctx: ToolSelectionContext): ToolCall {
  const phone = (ctx.memory.phone as string)
             || (ctx.memory.rich?.phone?.value as string)
             || '';
  return {
    tool:       'send_sms',
    params:     {
      to:      phone,
      type:    'booking_confirmation',
    },
    reason:     'Booking confirmed — send SMS confirmation',
    priority:   'high',
    required:   false,
    idempotent: false,
  };
}

function sendEmailCall(ctx: ToolSelectionContext): ToolCall {
  const email = (ctx.memory.email as string)
             || (ctx.memory.rich?.email?.value as string)
             || '';
  return {
    tool:       'send_email',
    params:     {
      to:   email,
      type: 'booking_confirmation',
    },
    reason:     'Booking confirmed — send email confirmation',
    priority:   'high',
    required:   false,
    idempotent: false,
  };
}

// ─── Main selector ────────────────────────────────────────────────────────────

/**
 * Deterministically selects the ordered list of tool calls for a given turn.
 *
 * Priority order:
 *   1. Emergency escalation (critical → immediate)
 *   2. Availability check (booking/emergency path)
 *   3. Book appointment (when data complete + booking stage)
 *   4. Lead upsert (whenever qualifying data is present)
 *   5. Post-booking notifications (SMS/email)
 *   6. FAQ lookup (question intents)
 *   7. Estimate (pricing intents)
 *   8. Non-emergency escalation
 */
export const ToolSelector = {

  select(ctx: ToolSelectionContext): ToolOrchestrationPlan {
    const calls: ToolCall[] = [];

    // ── Rule 1: Emergency ──────────────────────────────────────────────────
    if (isEmergency(ctx)) {
      calls.push(checkAvailabilityCall('Emergency detected — check immediate availability'));
      calls.push(escalateCall(ctx));
      return plan(calls, false, 'Emergency flow: check availability + escalate');
    }

    // ── Rule 2: Explicit escalation request ───────────────────────────────
    if (isEscalationIntent(ctx)) {
      calls.push(escalateCall(ctx));
      return plan(calls, false, 'User requested human agent');
    }

    // ── Rule 3: Booking path ──────────────────────────────────────────────
    if (isBookingIntent(ctx)) {
      // Always check availability so Gemini can mention specific slots
      calls.push(checkAvailabilityCall('Booking stage — fetch available slots'));

      // Only actually book if we have all required data
      if (isBookingReady(ctx) && ctx.memory.bookingStatus !== 'booked') {
        calls.push(bookAppointmentCall(ctx));
      }
    }

    // ── Rule 4: Lead upsert ───────────────────────────────────────────────
    // Run on every turn once minimum data is present (idempotent upsert)
    if (needsLeadUpsert(ctx)) {
      calls.push(createLeadCall(ctx));
    }

    // ── Rule 5: Post-booking notifications ───────────────────────────────
    if (isBookingConfirmed(ctx)) {
      if (hasPhone(ctx)) calls.push(sendSmsCall(ctx));
      if (hasEmail(ctx)) calls.push(sendEmailCall(ctx));
    }

    // ── Rule 6: FAQ ──────────────────────────────────────────────────────
    if (isFaqIntent(ctx) && ctx.userMessage.trim().length > 3) {
      calls.push(lookupFaqCall(ctx));
    }

    // ── Rule 7: Estimate ─────────────────────────────────────────────────
    if (isEstimateIntent(ctx) && ctx.stage !== 'greeting') {
      calls.push(getEstimateCall(ctx));
    }

    // No tools needed this turn
    if (calls.length === 0) {
      return plan([], true, 'No tools required this turn');
    }

    // Tools can run in parallel only if all are idempotent
    const allIdempotent = calls.every(c => c.idempotent);
    return plan(calls, allIdempotent, `Selected ${calls.length} tool(s)`);
  },

  /**
   * Dry-run variant — returns the plan without executing.
   * Useful for tests and debug endpoints.
   */
  preview(ctx: ToolSelectionContext): ToolOrchestrationPlan {
    const base = ToolSelector.select(ctx);
    return { ...base, dryRun: true };
  },
};

// ─── Plan factory ─────────────────────────────────────────────────────────────

function plan(
  calls:       ToolCall[],
  parallel:    boolean,
  reason:      string,
): ToolOrchestrationPlan {
  return {
    calls,
    runInParallel: parallel,
    reason,
    dryRun:        false,
  };
}
