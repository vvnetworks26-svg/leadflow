/**
 * handoff-engine/ContextBuilder.ts
 *
 * Builds a structured AgentContext from the handoff summary + conversation data.
 * Agents receive this and immediately understand the situation without asking
 * the customer to repeat themselves.
 *
 * PURE — no I/O, no side effects.
 */

import type {
  AgentContext,
  HandoffSummary,
  HandoffDestination,
  HandoffPriority,
  EscalationInput,
} from './types';

// ─── Brief generator ──────────────────────────────────────────────────────────

function buildAgentBrief(summary: HandoffSummary, businessName: string): string {
  const lines: string[] = [];

  const name    = summary.customer.name    ?? 'Unknown customer';
  const phone   = summary.customer.phone   ?? 'No phone';
  const service = summary.service          ?? 'Not specified';
  const stage   = summary.conversationStage;
  const urgency = summary.urgency;

  lines.push(`Customer: ${name} | Phone: ${phone}`);
  lines.push(`Service: ${service} | Stage: ${stage} | Urgency: ${urgency}`);

  if (summary.bookingStatus !== 'none') {
    lines.push(`Booking status: ${summary.bookingStatus}`);
  }

  if (summary.informationCollected.length > 0) {
    lines.push(`Collected: ${summary.informationCollected.join(', ')}`);
  }

  if (summary.missingInformation.length > 0) {
    lines.push(`Still needed: ${summary.missingInformation.join(', ')}`);
  }

  lines.push(`Reason for transfer: ${summary.reasonDescription}`);

  return lines.join('\n');
}

// ─── Context builder ──────────────────────────────────────────────────────────

export const ContextBuilder = {

  /**
   * Build a complete AgentContext from the handoff summary + escalation input.
   */
  build(params: {
    summary:       HandoffSummary;
    input:         EscalationInput;
    destination:   HandoffDestination;
    priority:      HandoffPriority;
    handoffId:     string;
  }): AgentContext {
    const { summary, input, destination, priority, handoffId } = params;
    const { identity, history, conversationId, organizationId } = input;

    const businessName = identity.companyProfile.businessName;
    const agentBrief   = buildAgentBrief(summary, businessName);

    // Include only the last 5 turns of conversation history for agents
    const recentHistory = history.slice(-10);  // 5 exchanges = 10 messages

    return Object.freeze({
      summary,
      recentHistory:  Object.freeze(recentHistory),
      businessName,
      businessPhone:  identity.contactInfo.phone,
      industry:       identity.companyProfile.industry,
      priority,
      destination,
      handoffId,
      conversationId,
      organizationId,
      createdAt:      new Date(input.nowMs ?? Date.now()).toISOString(),
      agentBrief,
    });
  },

  /**
   * Build a minimal context when full memory is not available.
   */
  minimal(params: {
    conversationId: string;
    organizationId: string;
    businessName:   string;
    handoffId:      string;
    reason:         string;
  }): Pick<AgentContext, 'conversationId' | 'organizationId' | 'businessName' | 'handoffId' | 'agentBrief'> {
    return {
      conversationId: params.conversationId,
      organizationId: params.organizationId,
      businessName:   params.businessName,
      handoffId:      params.handoffId,
      agentBrief:     `Transfer requested. Reason: ${params.reason}`,
    };
  },
};
