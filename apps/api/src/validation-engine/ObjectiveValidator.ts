/**
 * validation-engine/ObjectiveValidator.ts
 *
 * Every response must serve exactly ONE business objective.
 *
 * Rules:
 *   - Response must have a non-empty objective in the blueprint
 *   - Response must not ask multiple questions simultaneously
 *   - Response must not mix booking with qualification with recommendation
 *     in the same message
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

// ─── Question detection ────────────────────────────────────────────────────────

const QUESTION_PATTERN = /\?/g;

function countDistinctQuestions(text: string): number {
  // Split on sentence boundaries containing a question mark
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter(s => s.includes('?')).length;
}

// ─── Objective conflict patterns ──────────────────────────────────────────────

// These should not appear together in a single response
const OBJECTIVE_SIGNALS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'booking',        pattern: /\b(book|schedule|appointment|available (slot|time))\b/i },
  { name: 'qualification',  pattern: /\b(budget|timeline|decision maker|company size|employee)\b/i },
  { name: 'recommendation', pattern: /\b(i recommend|you should consider|check out|perfect (plan|product|solution) for you)\b/i },
  { name: 'collection',     pattern: /\b(what('?s| is) your (name|phone|email|address)|best number|reach you)\b/i },
  { name: 'objection',      pattern: /\b(understand your concern|many (clients|customers) felt|that('?s| is) (a |an )?(valid|reasonable|understandable))\b/i },
];

function detectObjectiveSignals(text: string): string[] {
  return OBJECTIVE_SIGNALS.filter(s => s.pattern.test(text)).map(s => s.name);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export const ObjectiveValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { blueprint, proposedResponse } = ctx;

    // 1. Blueprint must declare an objective
    if (!blueprint.objective || blueprint.objective.trim() === '') {
      return ValidationResult.fail(
        'ObjectiveValidator',
        'Response blueprint has no objective defined.',
        'objective',
      );
    }

    // 2. No more than 2 distinct questions (1 is ideal; 2 is a soft warn)
    const questionCount = countDistinctQuestions(proposedResponse);
    if (questionCount > 2) {
      return ValidationResult.fail(
        'ObjectiveValidator',
        `Response asks ${questionCount} questions. A response should focus on one.`,
        'objective',
      );
    }

    // 3. No conflicting objective signals
    const signals = detectObjectiveSignals(proposedResponse);
    if (signals.length >= 3) {
      return ValidationResult.fail(
        'ObjectiveValidator',
        `Response mixes too many objectives: [${signals.join(', ')}]. Focus on one.`,
        'objective',
      );
    }

    return ValidationResult.pass('ObjectiveValidator');
  },
};
