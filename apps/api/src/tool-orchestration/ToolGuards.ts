/**
 * tool-orchestration/ToolGuards.ts
 *
 * Layer 7 — Pre-execution guards.
 *
 * Each guard is a pure function that validates whether a tool call
 * may proceed. No I/O. No side effects.
 *
 * Guard contract:
 *   allowed: true   → proceed
 *   allowed: false  → block call, surface reason in ToolOrchestrationResult.errors
 */

import type { ToolCall, ToolGuardResult, ToolSelectionContext } from './types';

// ─── Individual guards ────────────────────────────────────────────────────────

function guardBookAppointment(
  call: ToolCall,
  ctx:  ToolSelectionContext,
): ToolGuardResult {
  const missing: string[] = [];
  const params = call.params as Record<string, unknown>;

  if (!params.guestName || String(params.guestName).trim() === '') {
    missing.push('guestName');
  }
  if (!params.guestEmail && !params.guestPhone) {
    missing.push('guestEmail or guestPhone');
  }

  if (ctx.memory.bookingStatus === 'booked') {
    return {
      allowed: false,
      reason:  'Booking already confirmed — will not create duplicate',
    };
  }

  if (missing.length > 0) {
    return {
      allowed: false,
      reason:  `Missing required booking fields: ${missing.join(', ')}`,
      missing,
    };
  }

  return { allowed: true };
}

function guardCreateLead(
  call: ToolCall,
): ToolGuardResult {
  const params = call.params as Record<string, unknown>;

  if (!params.name || String(params.name).trim() === '') {
    return {
      allowed: false,
      reason:  'Lead creation requires a name',
      missing: ['name'],
    };
  }

  const hasContact = params.phone || params.email;
  if (!hasContact) {
    return {
      allowed: false,
      reason:  'Lead creation requires phone or email',
      missing: ['phone or email'],
    };
  }

  return { allowed: true };
}

function guardSendSms(
  call: ToolCall,
): ToolGuardResult {
  const params = call.params as Record<string, unknown>;
  if (!params.to || String(params.to).trim() === '') {
    return { allowed: false, reason: 'SMS requires a valid phone number', missing: ['to'] };
  }
  return { allowed: true };
}

function guardSendEmail(
  call: ToolCall,
): ToolGuardResult {
  const params = call.params as Record<string, unknown>;
  const email  = String(params.to ?? '').trim();
  if (!email || !email.includes('@')) {
    return { allowed: false, reason: 'Email notification requires a valid email address', missing: ['to'] };
  }
  return { allowed: true };
}

function guardEscalate(
  _call: ToolCall,
  _ctx:  ToolSelectionContext,
): ToolGuardResult {
  // Escalation is always allowed — it is the safety valve
  return { allowed: true };
}

function guardCheckAvailability(
  _call: ToolCall,
  _ctx:  ToolSelectionContext,
): ToolGuardResult {
  // Read-only operation — always allowed
  return { allowed: true };
}

function guardGetEstimate(
  call: ToolCall,
): ToolGuardResult {
  const params = call.params as Record<string, unknown>;
  if (!params.service || String(params.service).trim() === '') {
    // Soft failure — no service identified yet, skip estimate
    return { allowed: false, reason: 'Cannot produce estimate without a service type', missing: ['service'] };
  }
  return { allowed: true };
}

function guardLookupFaq(
  call: ToolCall,
): ToolGuardResult {
  const params = call.params as Record<string, unknown>;
  if (!params.query || String(params.query).trim().length < 3) {
    return { allowed: false, reason: 'FAQ lookup requires a meaningful query', missing: ['query'] };
  }
  return { allowed: true };
}

// ─── Guard dispatcher ─────────────────────────────────────────────────────────

export const ToolGuards = {

  /**
   * Evaluate all guards for a single ToolCall.
   * Returns a ToolGuardResult — pure, no side effects.
   */
  check(call: ToolCall, ctx: ToolSelectionContext): ToolGuardResult {
    switch (call.tool) {
      case 'book_appointment':    return guardBookAppointment(call, ctx);
      case 'create_lead':         return guardCreateLead(call);
      case 'update_lead':         return guardCreateLead(call);   // same guard
      case 'send_sms':            return guardSendSms(call);
      case 'send_email':          return guardSendEmail(call);
      case 'escalate':            return guardEscalate(call, ctx);
      case 'check_availability':  return guardCheckAvailability(call, ctx);
      case 'get_estimate':        return guardGetEstimate(call);
      case 'lookup_faq':          return guardLookupFaq(call);
      default:
        return { allowed: true };
    }
  },

  /**
   * Filter a list of calls, returning only those that pass their guard.
   * Blocked calls are returned separately for audit / logging.
   */
  filter(
    calls: readonly ToolCall[],
    ctx:   ToolSelectionContext,
  ): {
    allowed: ToolCall[];
    blocked: Array<{ call: ToolCall; reason: string }>;
  } {
    const allowed: ToolCall[] = [];
    const blocked: Array<{ call: ToolCall; reason: string }> = [];

    for (const call of calls) {
      const result = ToolGuards.check(call, ctx);
      if (result.allowed) {
        allowed.push(call);
      } else {
        blocked.push({ call, reason: result.reason ?? 'Guard blocked' });
      }
    }

    return { allowed, blocked };
  },
};
