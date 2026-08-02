/**
 * response-engine/ResponseBlueprint.ts
 *
 * Factory that assembles a frozen, immutable ResponseBlueprint.
 * This is the ONLY place a ResponseBlueprint is created.
 */

import type { ResponseBlueprint } from './types';
import type { Tone, Emotion, ResponseLength, CTAType, ResponseStyle, UrgencyLevel } from './types';
import type { ConversationStage } from '../ai/types';
import type { ConversationObjective, WorkflowState } from '../conversation-engine/types';
import type { Industry } from '../business-identity/types';

export interface BuildBlueprintParams {
  objective:       ConversationObjective;
  tone:            Tone;
  emotion:         Emotion;
  urgency:         UrgencyLevel;
  cta:             CTAType;
  question?:       string;
  personalization: ResponseBlueprint['personalization'];
  length:          ResponseLength;
  style:           ResponseStyle;
  mustMention:     string[];
  mustAvoid:       string[];
  guardrails:      string[];
  examples:        string[];
  industry:        Industry | string;
  stage:           ConversationStage;
  workflowState:   WorkflowState;
}

export function buildResponseBlueprint(p: BuildBlueprintParams): ResponseBlueprint {
  return Object.freeze({
    objective:       p.objective,
    tone:            p.tone,
    emotion:         p.emotion,
    urgency:         p.urgency,
    cta:             p.cta,
    question:        p.question || undefined,
    personalization: Object.freeze({ ...p.personalization }),
    length:          p.length,
    style:           p.style,
    mustMention:     Object.freeze([...p.mustMention]),
    mustAvoid:       Object.freeze([...p.mustAvoid]),
    guardrails:      Object.freeze([...p.guardrails]),
    examples:        Object.freeze([...p.examples]),
    metadata: Object.freeze({
      industry:      p.industry as string,
      stage:         p.stage,
      objective:     p.objective,
      workflowState: p.workflowState,
    }),
  });
}
