/**
 * handoff-engine/ConfidenceEvaluator.ts
 *
 * Evaluates AI confidence and determines if it's too low to continue.
 *
 * Factors:
 *   - Raw confidence score from Intent Engine
 *   - Confidence level label (very_high / high / medium / low / unknown)
 *   - Consecutive clarification attempts
 *   - Conversation stage (early stages tolerate lower confidence)
 *   - Whether intent is unknown/unclear
 *
 * PURE — no I/O, no side effects.
 */

import type { ConversationStage } from '../ai/types';
import type { ConfidenceLevel } from '../intent-engine/types';

// Minimum acceptable confidence by stage
const STAGE_THRESHOLDS: Record<ConversationStage, number> = {
  greeting:       20,   // very tolerant at start
  discovery:      30,
  qualification:  35,
  recommendation: 40,
  objection:      30,
  booking:        50,   // must be clear before booking
  completed:      20,
  escalated:      0,    // already escalating
};

export interface ConfidenceEvaluation {
  readonly shouldEscalate:       boolean;
  readonly effectiveScore:       number;    // adjusted score
  readonly reason?:              string;
  readonly clarificationNeeded:  boolean;
}

export const ConfidenceEvaluator = {

  evaluate(params: {
    rawScore:              number;             // 0–100 from intent engine
    confidenceLevel:       ConfidenceLevel;
    stage:                 ConversationStage;
    clarificationAttempts: number;
    policyThreshold:       number;             // from EscalationPolicy.confidenceThreshold
    maxClarificationAttempts?: number;
  }): ConfidenceEvaluation {
    const {
      rawScore,
      confidenceLevel,
      stage,
      clarificationAttempts,
      policyThreshold,
      maxClarificationAttempts = 3,
    } = params;

    // Adjust score based on confidence level label
    const levelPenalty: Record<ConfidenceLevel, number> = {
      very_high: 0,
      high:      0,
      medium:    -5,
      low:       -20,
      unknown:   -40,
    };
    const effectiveScore = Math.max(0, rawScore + (levelPenalty[confidenceLevel] ?? 0));

    // Check against policy threshold
    if (effectiveScore < policyThreshold) {
      return {
        shouldEscalate:      true,
        effectiveScore,
        reason:              `AI confidence (${effectiveScore}) is below threshold (${policyThreshold}).`,
        clarificationNeeded: false,
      };
    }

    // Check against stage-specific threshold
    const stageThreshold = STAGE_THRESHOLDS[stage] ?? 30;
    if (effectiveScore < stageThreshold) {
      return {
        shouldEscalate:      false,
        effectiveScore,
        reason:              `Confidence low for stage "${stage}" — clarification needed.`,
        clarificationNeeded: true,
      };
    }

    // Check clarification attempts exhausted
    if (clarificationAttempts >= maxClarificationAttempts) {
      return {
        shouldEscalate:      true,
        effectiveScore,
        reason:              `Clarification attempts exhausted (${clarificationAttempts}/${maxClarificationAttempts}).`,
        clarificationNeeded: false,
      };
    }

    return {
      shouldEscalate:      false,
      effectiveScore,
      clarificationNeeded: confidenceLevel === 'low' || confidenceLevel === 'unknown',
    };
  },

  /** Determine if this confidence level requires immediate escalation */
  isUnacceptable(level: ConfidenceLevel): boolean {
    return level === 'unknown';
  },
};
