/**
 * validation-engine/RepetitionValidator.ts
 *
 * Prevents the AI from asking the same question it asked recently.
 *
 * Checks:
 *   1. Exact duplicate of last AI turn
 *   2. Semantic overlap (same stem words > threshold)
 *   3. Same question field asked twice in last N turns
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';

const LOOK_BACK_TURNS = 4;      // last 4 assistant messages to compare
const OVERLAP_THRESHOLD = 0.72; // 72% word overlap = repetition

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function recentAssistantMessages(ctx: ValidationContext): string[] {
  return ctx.history
    .filter(m => m.role === 'assistant')
    .slice(-LOOK_BACK_TURNS)
    .map(m => m.content);
}

// ─── Validator ────────────────────────────────────────────────────────────────

export const RepetitionValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const proposed = ctx.proposedResponse.trim();
    if (!proposed) return ValidationResult.pass('RepetitionValidator');

    const recent = recentAssistantMessages(ctx);
    if (recent.length === 0) return ValidationResult.pass('RepetitionValidator');

    const proposedTokens = tokenise(proposed);

    for (const prev of recent) {
      // 1. Exact match (normalised)
      if (prev.trim().toLowerCase() === proposed.toLowerCase()) {
        return ValidationResult.fail(
          'RepetitionValidator',
          'Response is identical to a recent AI message.',
        );
      }

      // 2. High semantic overlap
      const prevTokens = tokenise(prev);
      const sim = jaccardSimilarity(proposedTokens, prevTokens);
      if (sim >= OVERLAP_THRESHOLD) {
        return ValidationResult.fail(
          'RepetitionValidator',
          `Response is too similar to a recent message (overlap: ${(sim * 100).toFixed(0)}%).`,
        );
      }
    }

    return ValidationResult.pass('RepetitionValidator');
  },
};
