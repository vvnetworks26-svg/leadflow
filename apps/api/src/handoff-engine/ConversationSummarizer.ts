/**
 * handoff-engine/ConversationSummarizer.ts
 *
 * Generates a deterministic HandoffSummary from memory + conversation context.
 * Zero LLM calls. Everything comes from the Memory Engine.
 *
 * PURE — no I/O, no side effects.
 */

import type { EscalationInput, HandoffSummary, CollectedInfo, EscalationReason } from './types';

// ─── Field label maps ─────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  visitorNameCollected: 'Name',
  phoneCollected:       'Phone',
  emailCollected:       'Email',
  addressCollected:     'Address',
  serviceCollected:     'Service',
  painCollected:        'Pain Points',
  appointmentCollected: 'Preferred Time',
  emergencyCollected:   'Emergency Status',
  budgetCollected:      'Budget',
  timelineCollected:    'Timeline',
  companyCollected:     'Company',
};

// ─── Summarizer ───────────────────────────────────────────────────────────────

export const ConversationSummarizer = {

  /**
   * Build a complete HandoffSummary from memory and conversation context.
   * No LLM — every field is derived deterministically from memory.
   */
  summarize(
    input:  EscalationInput,
    reason: EscalationReason,
  ): HandoffSummary {
    const { memory, stage, urgency, intentCategory, turnCount } = input;
    const progress = memory.progress;

    // Collected customer info
    const customer: CollectedInfo = {
      name:          memory.visitorName         ?? undefined,
      phone:         memory.phone               ?? undefined,
      email:         memory.email               ?? undefined,
      address:       memory.rich?.address?.value ?? undefined,
      service:       memory.servicesDiscussed[0] ?? memory.rich?.service?.value ?? undefined,
      preferredTime: memory.rich?.preferredTime?.value ?? undefined,
      company:       memory.company             ?? undefined,
    };

    // Which fields are collected
    const informationCollected: string[] = [];
    const missingInformation:   string[] = [];

    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      const isCollected = (progress as any)[key] === true;
      if (isCollected) {
        informationCollected.push(label);
      } else {
        missingInformation.push(label);
      }
    }

    // Service from memory
    const service = memory.rich?.service?.value
                 ?? memory.servicesDiscussed[0]
                 ?? null;

    return {
      customer,
      service,
      intent:               intentCategory,
      urgency,
      conversationStage:    stage,
      informationCollected: Object.freeze(informationCollected),
      missingInformation:   Object.freeze(missingInformation),
      reasonForHandoff:     reason,
      reasonDescription:    buildReasonDescription(reason),
      bookingStatus:        memory.bookingStatus,
      painPoints:           Object.freeze([...memory.painPoints]),
      objections:           Object.freeze([...memory.objections]),
      turnCount,
      generatedAt:          new Date(input.nowMs ?? Date.now()).toISOString(),
    };
  },
};

// ─── Reason descriptions ──────────────────────────────────────────────────────

function buildReasonDescription(reason: EscalationReason): string {
  const descriptions: Record<EscalationReason, string> = {
    customer_requested_human:       'Customer explicitly asked to speak with a human agent.',
    low_ai_confidence:              'AI confidence fell below the configured threshold.',
    repeated_clarification_failure: 'The AI made multiple clarification attempts without success.',
    complaint_detected:             'Customer expressed a complaint or dissatisfaction.',
    frustration_detected:           'Customer showed signs of frustration with the conversation.',
    billing_question:               'Customer has a billing or payment-related question.',
    legal_issue:                    'Customer raised a potential legal issue or threat.',
    payment_issue:                  'Customer has a payment dispute or issue.',
    profanity_detected:             'Inappropriate language was detected in the conversation.',
    unsupported_request:            'Customer request cannot be handled by the AI.',
    business_rule:                  'A business-configured rule triggered the handoff.',
    booking_completed:              'Booking was completed and follow-up by human is required.',
    emergency_escalation:           'Emergency situation detected requiring immediate human response.',
    vip_customer:                   'VIP customer routing policy triggered.',
    office_hours_only:              'Business only handles AI conversations during office hours.',
  };
  return descriptions[reason] ?? 'Handoff was triggered.';
}
