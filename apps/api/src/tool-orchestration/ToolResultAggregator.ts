/**
 * tool-orchestration/ToolResultAggregator.ts
 *
 * Layer 7 — Pure result aggregator.
 *
 * Converts raw ToolResult[] from execution into the structured
 * ToolOrchestrationResult consumed by the orchestrator.
 *
 * PURE — no I/O, no side effects.
 */

import type {
  ToolResult,
  ToolOrchestrationResult,
  ToolOrchestrationPlan,
  AvailabilityResult,
  AvailableSlot,
  BookingResult,
  LeadResult,
  EstimateResult,
} from './types';

// ─── Slot formatters ──────────────────────────────────────────────────────────

function formatSlotLabel(isoLocal: string, timezone: string): string {
  try {
    const d = new Date(isoLocal);
    return d.toLocaleString('en-US', {
      weekday: 'long',
      month:   'short',
      day:     'numeric',
      hour:    'numeric',
      minute:  '2-digit',
      timeZone: timezone,
    });
  } catch {
    return isoLocal;
  }
}

function normaliseSlot(raw: Record<string, unknown>): AvailableSlot {
  const tz = String(raw.timezone ?? 'UTC');
  return {
    startLocal: String(raw.startLocal ?? ''),
    endLocal:   String(raw.endLocal ?? ''),
    timezone:   tz,
    label:      formatSlotLabel(String(raw.startLocal ?? ''), tz),
  };
}

function extractAvailability(result: ToolResult): AvailabilityResult | undefined {
  if (result.tool !== 'check_availability' || result.status !== 'success') return undefined;

  const raw  = result.data as Record<string, unknown> | null;
  if (!raw) return undefined;

  const rawSlots     = Array.isArray(raw.slots)     ? raw.slots     : [];
  const rawSuggested = Array.isArray(raw.suggested)  ? raw.suggested : rawSlots.slice(0, 3);

  const slots     = rawSlots.map((s: unknown) => normaliseSlot(s as Record<string, unknown>));
  const suggested = rawSuggested.slice(0, 3).map((s: unknown) => normaliseSlot(s as Record<string, unknown>));
  const next      = raw.nextAvailable
    ? normaliseSlot(raw.nextAvailable as Record<string, unknown>)
    : slots[0] ?? null;

  return {
    slots,
    nextAvailable:  next,
    suggested,
    hasOpenSlots:   slots.length > 0,
  };
}

function extractBooking(result: ToolResult): BookingResult | undefined {
  if (result.tool !== 'book_appointment' || result.status !== 'success') return undefined;

  const raw = result.data as Record<string, unknown> | null;
  if (!raw) return undefined;

  const appt = (raw.appointment ?? raw) as Record<string, unknown>;
  return {
    confirmationCode: String(appt.confirmationCode ?? appt.confirmation_code ?? ''),
    bookingId:        String(appt._id ?? appt.id ?? appt.bookingId ?? ''),
    startLocal:       String(appt.startLocal ?? appt.startUtc ?? ''),
    serviceType:      String(appt.type ?? appt.serviceType ?? appt.meetingTypeName ?? 'Service Appointment'),
    assigneeName:     appt.assigneeName ? String(appt.assigneeName) : undefined,
  };
}

function extractLead(result: ToolResult): LeadResult | undefined {
  if (!['create_lead', 'update_lead'].includes(result.tool)) return undefined;
  if (result.status !== 'success') return undefined;

  const raw = result.data as Record<string, unknown> | null;
  if (!raw) return undefined;

  return {
    leadId:  String(raw._id ?? raw.id ?? ''),
    isNew:   result.tool === 'create_lead',
    status:  String(raw.status ?? 'new'),
  };
}

function extractEstimate(result: ToolResult): EstimateResult | undefined {
  if (result.tool !== 'get_estimate' || result.status !== 'success') return undefined;

  const raw = result.data as Record<string, unknown> | null;
  if (!raw) return undefined;

  return {
    rangeMin:    Number(raw.rangeMin ?? 0),
    rangeMax:    Number(raw.rangeMax ?? 0),
    currency:    String(raw.currency ?? 'USD'),
    disclaimer:  String(raw.disclaimer ?? 'Estimate is for reference only.'),
    factors:     Array.isArray(raw.factors) ? raw.factors.map(String) : [],
  };
}

function extractFaq(result: ToolResult): string | undefined {
  if (result.tool !== 'lookup_faq' || result.status !== 'success') return undefined;

  const raw = result.data;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    return String(first.content ?? first.answer ?? '');
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return String(obj.content ?? obj.answer ?? '');
  }
  return undefined;
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

export const ToolResultAggregator = {

  /**
   * Build a structured ToolOrchestrationResult from raw execution results.
   * Pure function — no I/O.
   */
  aggregate(
    plan:        ToolOrchestrationPlan,
    results:     readonly ToolResult[],
    durationMs:  number,
  ): ToolOrchestrationResult {

    const errors: string[] = results
      .filter(r => r.status === 'failure')
      .map(r => `[${r.tool}] ${r.error ?? 'Unknown error'}`);

    const escalated = results.some(
      r => r.tool === 'escalate' && r.status === 'success',
    );

    // Extract structured data
    let availability: AvailabilityResult | undefined;
    let booking:      BookingResult       | undefined;
    let lead:         LeadResult          | undefined;
    let estimate:     EstimateResult      | undefined;
    let faqAnswer:    string              | undefined;

    for (const r of results) {
      availability ??= extractAvailability(r);
      booking      ??= extractBooking(r);
      lead         ??= extractLead(r);
      estimate     ??= extractEstimate(r);
      faqAnswer    ??= extractFaq(r);
    }

    return {
      plan,
      results,
      availability,
      booking,
      lead,
      estimate,
      faqAnswer,
      escalated,
      totalDurationMs: durationMs,
      errors,
    };
  },

  /**
   * Produce an empty result when no tools were run.
   */
  empty(plan: ToolOrchestrationPlan): ToolOrchestrationResult {
    return {
      plan,
      results:        [],
      availability:   undefined,
      booking:        undefined,
      lead:           undefined,
      estimate:       undefined,
      faqAnswer:      undefined,
      escalated:      false,
      totalDurationMs:0,
      errors:         [],
    };
  },
};
