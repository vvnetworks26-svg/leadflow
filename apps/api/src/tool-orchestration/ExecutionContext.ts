/**
 * tool-orchestration/ExecutionContext.ts
 *
 * Converts raw tool results into structured conversational context.
 * Gemini receives ONLY this output — never raw tool responses.
 *
 * Each tool's output is normalized into a human-readable block that
 * the LLM renderer can incorporate into its response.
 *
 * PURE — no I/O, no side effects.
 */

import type { ToolName } from './types';
import type { ToolExecutionResult } from './ToolResultBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single piece of structured context for Gemini */
export interface ContextBlock {
  readonly label:    string;   // section header
  readonly content:  string;   // human-readable normalized content
  readonly tool:     ToolName;
  readonly priority: number;   // higher = appears earlier in context
}

/** All context blocks combined into a single prompt-ready string */
export interface ExecutionContextOutput {
  readonly blocks:       readonly ContextBlock[];
  readonly contextBlock: string;    // the final assembled string for the prompt
  readonly hasResults:   boolean;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatAvailability(data: Record<string, unknown>): string {
  const slots = data.suggested ?? data.slots;
  if (!Array.isArray(slots) || slots.length === 0) {
    return 'No available slots found in the next 7 days.';
  }

  const lines = (slots as Array<Record<string, unknown>>).slice(0, 5).map(s => {
    const label = s.label ?? s.startLocal ?? '';
    return `  • ${label}`;
  });

  const next = (data.nextAvailable as Record<string, unknown> | null)?.label
            ?? (slots as Array<Record<string, unknown>>)[0]?.label ?? '';

  return [
    `Next available: ${next}`,
    'Available appointment slots:',
    ...lines,
  ].join('\n');
}

function formatBooking(data: Record<string, unknown>): string {
  const appt = (data.appointment ?? data) as Record<string, unknown>;
  const code  = appt.confirmationCode ?? appt.confirmationNumber ?? appt.confirmation_code ?? '';
  const time  = appt.startLocal ?? appt.startUtc ?? appt.time ?? '';
  const type  = appt.type ?? appt.serviceType ?? appt.meetingTypeName ?? 'Service Appointment';
  return [
    '✅ Appointment confirmed!',
    `  Type: ${type}`,
    `  Time: ${time}`,
    `  Confirmation: ${code}`,
  ].join('\n');
}

function formatLead(data: Record<string, unknown>): string {
  const isNew = data.isNew ?? false;
  const id    = data.leadId ?? (data as any)._id ?? '';
  if (isNew) return `New lead created (ID: ${id})`;
  return `Lead record updated (ID: ${id})`;
}

function formatEstimate(data: Record<string, unknown>): string {
  const min  = data.rangeMin ?? 0;
  const max  = data.rangeMax ?? 0;
  const curr = data.currency ?? 'USD';
  const disc = data.disclaimer ?? '';
  const factors = Array.isArray(data.factors) ? (data.factors as string[]).join(', ') : '';

  return [
    `Estimated cost range: $${min}–$${max} ${curr}`,
    factors ? `Key factors: ${factors}` : null,
    disc ? `Note: ${disc}` : null,
  ].filter(Boolean).join('\n');
}

function formatFaq(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    return String(first.content ?? first.answer ?? '');
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    return String(obj.content ?? obj.answer ?? '');
  }
  return '';
}

function formatEscalation(data: Record<string, unknown>): string {
  const reason = data.reason ?? 'customer_requested';
  return `Escalation triggered (reason: ${reason}). A team member will follow up shortly.`;
}

function formatSms(data: Record<string, unknown>): string {
  return data.queued ? `SMS confirmation queued to ${data.to}` : 'SMS not sent';
}

function formatEmail(data: Record<string, unknown>): string {
  return data.queued ? `Email confirmation queued to ${data.to}` : 'Email not sent';
}

// ─── Priority map ─────────────────────────────────────────────────────────────

const PRIORITY: Partial<Record<ToolName, number>> = {
  escalate:          100,
  book_appointment:  90,
  check_availability:80,
  get_estimate:      70,
  lookup_faq:        60,
  create_lead:       50,
  update_lead:       45,
  send_sms:          30,
  send_email:        30,
};

// ─── Builder ──────────────────────────────────────────────────────────────────

export const ExecutionContext = {

  /**
   * Convert a ToolExecutionResult into structured context blocks for Gemini.
   * Pure function — no I/O.
   */
  build(executionResult: ToolExecutionResult): ExecutionContextOutput {
    const blocks: ContextBlock[] = [];

    for (const result of executionResult.results) {
      if (result.status !== 'success' && result.status !== 'cached') continue;

      const data    = (result.data ?? {}) as Record<string, unknown>;
      let   content = '';
      let   label   = '';

      switch (result.tool) {
        case 'check_availability':
          content = formatAvailability(data);
          label   = 'AVAILABLE APPOINTMENT SLOTS';
          break;
        case 'book_appointment':
          content = formatBooking(data);
          label   = 'BOOKING CONFIRMATION';
          break;
        case 'create_lead':
        case 'update_lead':
          content = formatLead({ ...data, isNew: result.tool === 'create_lead' });
          label   = 'CRM UPDATE';
          break;
        case 'get_estimate':
          content = formatEstimate(data);
          label   = 'PRICING ESTIMATE';
          break;
        case 'lookup_faq':
          content = formatFaq(result.data);
          label   = 'KNOWLEDGE BASE';
          break;
        case 'escalate':
          content = formatEscalation(data);
          label   = 'ESCALATION';
          break;
        case 'send_sms':
          content = formatSms(data);
          label   = 'SMS NOTIFICATION';
          break;
        case 'send_email':
          content = formatEmail(data);
          label   = 'EMAIL NOTIFICATION';
          break;
      }

      if (content) {
        blocks.push({
          label,
          content,
          tool:     result.tool,
          priority: PRIORITY[result.tool] ?? 0,
        });
      }
    }

    // Sort by priority descending (highest first)
    blocks.sort((a, b) => b.priority - a.priority);

    const contextBlock = blocks.length > 0
      ? blocks.map(b => `[${b.label}]\n${b.content}`).join('\n\n')
      : '';

    return {
      blocks,
      contextBlock,
      hasResults: blocks.length > 0,
    };
  },

  /**
   * Build context from just an availability result (convenience overload).
   * Used when the orchestrator has raw availability data without a full result.
   */
  fromAvailability(data: Record<string, unknown>): string {
    return formatAvailability(data);
  },

  /**
   * Build context from just an estimate result.
   */
  fromEstimate(data: Record<string, unknown>): string {
    return formatEstimate(data);
  },
};
