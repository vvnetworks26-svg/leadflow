/**
 * response-engine/ResponseTone.ts
 *
 * Deterministic tone selection.
 * No AI. No randomness. Pure function.
 *
 * Priority order (highest wins):
 *   1. Urgency override (critical/emergency → Dispatcher/Urgent)
 *   2. Objective override (escalation → Calm, recommendation → Consultative)
 *   3. Brand personality mapping
 *   4. Industry default
 *   5. Fallback: Friendly
 */

import type { Tone } from './types';
import type { UrgencyLevel } from '../intent-engine/types';
import type { AiTone, Industry } from '../business-identity/types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';

// ─── Industry defaults ────────────────────────────────────────────────────────

const INDUSTRY_TONE: Partial<Record<Industry, Tone>> = {
  hvac:        'Friendly',
  plumbing:    'Confident',
  roofing:     'Confident',
  electrical:  'Professional',
  pest_control:'Calm',
  landscaping: 'Friendly',
  cleaning:    'Friendly',
  saas:        'Consultative',
  agency:      'Consultative',
  real_estate: 'Professional',
  general:     'Friendly',
};

// ─── Brand tone mapping ───────────────────────────────────────────────────────

const BRAND_TONE_MAP: Record<AiTone, Tone> = {
  friendly:     'Friendly',
  professional: 'Professional',
  casual:       'Friendly',
};

// ─── Objective overrides ──────────────────────────────────────────────────────

const OBJECTIVE_TONE: Partial<Record<ConversationObjective, Tone>> = {
  handle_emergency:         'Dispatcher',
  escalate_to_human:        'Calm',
  resolve_objection:        'Consultative',
  offer_recommendation:     'Consultative',
  answer_question:          'Educational',
  complete_conversation:    'Friendly',
  handle_complaint:         'Apologetic' as any,  // mapped from emotion in tone
  provide_estimate:         'Consultative',
  confirm_appointment:      'Confident',
  offer_appointment:        'Friendly',
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function selectTone(params: {
  urgency:    UrgencyLevel;
  objective:  ConversationObjective;
  brandTone:  AiTone;
  industry:   Industry;
  workflowState: WorkflowState;
}): Tone {
  const { urgency, objective, brandTone, industry, workflowState } = params;

  // 1. Urgency overrides everything
  if (urgency === 'critical') return 'Dispatcher';
  if (urgency === 'emergency') return 'Urgent';

  // 2. Workflow state overrides
  if (workflowState === 'emergency_dispatch') return 'Dispatcher';
  if (workflowState === 'escalating')         return 'Calm';

  // 3. Objective override
  const objTone = OBJECTIVE_TONE[objective];
  if (objTone) return objTone;

  // 4. Brand personality
  const brand = BRAND_TONE_MAP[brandTone];
  if (brand) return brand;

  // 5. Industry default
  return INDUSTRY_TONE[industry] ?? 'Friendly';
}
