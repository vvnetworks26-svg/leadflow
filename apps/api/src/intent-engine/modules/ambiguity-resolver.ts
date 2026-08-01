/**
 * intent-engine/modules/ambiguity-resolver.ts
 *
 * Resolves ambiguous multi-intent situations.
 * Selects the primary intent from candidates, determines whether
 * clarification is needed, and generates a clarification question.
 *
 * Rules:
 *   - Emergency always wins when present (regardless of score gap)
 *   - Human representative always wins when present
 *   - If gap between top-2 < 15 points AND primary is not certain → clarify
 *   - Never ask the customer to repeat themselves
 */

import type { IntentCandidate, IntentCategory } from '../types';

// ─── Clarification question templates ─────────────────────────────────────────

const CLARIFICATION_TEMPLATES: Partial<Record<IntentCategory, string>> = {
  repair:           "Are you looking for a repair, or would you like us to give you a price estimate first?",
  request_estimate: "Would you like a repair or a free estimate?",
  installation:     "Are you looking to repair your current system, or replace it with a new one?",
  maintenance:      "Are you looking for a tune-up/maintenance visit, or is something currently not working?",
  existing_appointment: "Are you calling about an existing appointment, or would you like to schedule a new one?",
  reschedule:       "Would you like to reschedule your appointment, or is this about something else?",
};

const DEFAULT_CLARIFICATION =
  "I want to make sure I get you to the right place. Are you looking to book a service, get a quote, or something else?";

// ─── Intent priority overrides ────────────────────────────────────────────────
// These intents always win over others when present, regardless of score.

const ALWAYS_WIN: readonly IntentCategory[] = [
  'human_representative',
  'emergency_service',
  'complaint',
];

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ResolutionResult {
  readonly primary:                IntentCandidate;
  readonly requiresClarification:  boolean;
  readonly clarificationQuestion:  string | null;
}

/**
 * Select the primary intent from an ordered list of candidates.
 * Returns the best candidate and whether clarification is needed.
 */
export function resolveIntent(
  candidates: readonly IntentCandidate[],
): ResolutionResult {
  if (candidates.length === 0) {
    const unknown: IntentCandidate = {
      category: 'unknown', subCategory: '', score: 0, signals: [],
    };
    return { primary: unknown, requiresClarification: false, clarificationQuestion: null };
  }

  // Check for always-win intents first (they override score ranking)
  for (const winner of ALWAYS_WIN) {
    const found = candidates.find(c => c.category === winner);
    if (found) {
      return { primary: found, requiresClarification: false, clarificationQuestion: null };
    }
  }

  const primary   = candidates[0];
  const secondary = candidates[1];

  // Determine whether clarification is genuinely useful
  const gapTooSmall   = secondary && (primary.score - secondary.score) < 15;
  const notConfident  = primary.score < 70;
  const shouldClarify = gapTooSmall && notConfident;

  if (shouldClarify) {
    const q = buildClarificationQuestion(primary.category, secondary?.category);
    return {
      primary,
      requiresClarification: true,
      clarificationQuestion: q,
    };
  }

  return { primary, requiresClarification: false, clarificationQuestion: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildClarificationQuestion(
  primary:   IntentCategory,
  secondary: IntentCategory | undefined,
): string {
  // Try primary template
  if (CLARIFICATION_TEMPLATES[primary]) return CLARIFICATION_TEMPLATES[primary]!;
  // Try secondary template
  if (secondary && CLARIFICATION_TEMPLATES[secondary]) return CLARIFICATION_TEMPLATES[secondary]!;
  return DEFAULT_CLARIFICATION;
}
