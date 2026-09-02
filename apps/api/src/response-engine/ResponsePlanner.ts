/**
 * response-engine/ResponsePlanner.ts
 *
 * Derives the ResponseStyle and supporting metadata from the pipeline context.
 * Pure function.
 */

import type { ResponseStyle } from './types';
import type { Industry } from '../business-identity/types';
import type { ConversationObjective } from '../conversation-engine/types';
import type { ConversationStage } from '../ai/types';

// ─── Style selection ──────────────────────────────────────────────────────────

const INDUSTRY_STYLE: Partial<Record<Industry, ResponseStyle>> = {
  hvac:        'Dispatcher',
  plumbing:    'Dispatcher',
  roofing:     'Advisor',
  electrical:  'Technical',
  pest_control:'Conversational',
  landscaping: 'Conversational',
  cleaning:    'Conversational',
  saas:        'Sales',
  agency:      'Advisor',
  real_estate: 'Concierge',
  general:     'Conversational',
};

const OBJECTIVE_STYLE: Partial<Record<ConversationObjective, ResponseStyle>> = {
  handle_emergency:      'Dispatcher',
  escalate_to_human:     'Conversational',
  offer_recommendation:  'Advisor',
  answer_question:       'Advisor',
  provide_estimate:      'Advisor',
  resolve_objection:     'Advisor',
  confirm_appointment:   'Dispatcher',
  complete_conversation: 'Conversational',
};

export function selectStyle(params: {
  objective: ConversationObjective;
  stage:     ConversationStage;
  industry:  Industry;
}): ResponseStyle {
  // Objective override first
  const objStyle = OBJECTIVE_STYLE[params.objective];
  if (objStyle) return objStyle;

  // Industry default
  return INDUSTRY_STYLE[params.industry] ?? 'Conversational';
}

// ─── Guardrails builder ───────────────────────────────────────────────────────

export function buildGuardrails(params: {
  objective:  ConversationObjective;
  stage:      ConversationStage;
  hasRules:   boolean;
  neverAskCompanyName: boolean;
}): string[] {
  const rails: string[] = [
    'Ask only one question per message',
    'Never repeat a question already answered',
    'Keep the response focused on the current objective',
  ];

  if (params.neverAskCompanyName) {
    rails.push('Do not ask for company name');
  }
  if (params.objective === 'handle_emergency') {
    rails.push('Lead with urgency acknowledgement before anything else');
    rails.push('Keep the message under 2 sentences');
  }
  if (params.stage === 'recommendation' || params.objective === 'offer_recommendation') {
    rails.push('Present at most 2 options');
    rails.push('Explain WHY each option fits this specific customer');
  }
  if (params.objective === 'resolve_objection') {
    rails.push('Empathize first, then reframe');
    rails.push('Never be defensive');
  }

  return rails;
}

// ─── Response examples builder ────────────────────────────────────────────────

export function buildExamples(params: {
  objective:    ConversationObjective;
  visitorName?: string;
  service?:     string;
}): string[] {
  const name = params.visitorName ? `, ${params.visitorName}` : '';
  const svc  = params.service ?? 'your service';

  const EXAMPLES: Partial<Record<ConversationObjective, string[]>> = {
    collect_phone:        [`"What's the best number to reach you${name}?"`],
    collect_name:         ['"First, what\'s your name?"'],
    collect_address:      ['"What\'s the service address?"'],
    handle_emergency:     [`"I understand this is urgent${name}. Let me get you scheduled right away — can I get your address?"`],
    offer_appointment:    ['"Great — let me check our availability. Do mornings or afternoons work better for you?"'],
    confirm_appointment:  [`"Perfect${name}! You\'re all booked for ${svc}. You\'ll receive a confirmation shortly."`],
    resolve_objection:    ['"That\'s completely understandable — many customers feel the same way. Here\'s what makes us different..."'],
    complete_conversation:[`"We\'re all set${name}! Someone will be in touch shortly."`],
    escalate_to_human:   ['"Let me connect you with someone from our team right away."'],
  };

  return EXAMPLES[params.objective] ?? [];
}
