/**
 * intent-engine/IntentFactory.ts
 *
 * Constructs an immutable ResolvedIntent aggregate.
 * This is the ONLY place a ResolvedIntent is created.
 */

import { randomUUID }            from 'crypto';
import type { ResolvedIntent, IntentCandidate, ExtractedEntity, UrgencyLevel, ConfidenceLevel, IntentCategory } from './types';
import { toConfidenceLevel }     from './modules/confidence-evaluator';

export interface BuildIntentParams {
  category:               IntentCategory;
  subCategory:            string;
  score:                  number;            // raw 0–100
  urgency:                UrgencyLevel;
  detectedService:        string | null;
  entities:               readonly ExtractedEntity[];
  candidates:             readonly IntentCandidate[];
  reasoning:              string;
  blueprintId:            string | null;
  requiresHuman:          boolean;
  requiresClarification:  boolean;
  rawMessage:             string;
}

export function buildResolvedIntent(params: BuildIntentParams): ResolvedIntent {
  return Object.freeze({
    id:                    randomUUID(),
    category:              params.category,
    subCategory:           params.subCategory,
    confidenceLevel:       toConfidenceLevel(params.score),
    urgency:               params.urgency,
    detectedService:       params.detectedService,
    entities:              Object.freeze([...params.entities]),
    candidates:            Object.freeze([...params.candidates]),
    reasoning:             params.reasoning,
    blueprintId:           params.blueprintId,
    requiresHuman:         params.requiresHuman,
    requiresClarification: params.requiresClarification,
    rawMessage:            params.rawMessage,
    timestamp:             new Date(),
  });
}
