/**
 * intent-engine/modules/confidence-evaluator.ts
 *
 * Maps raw numeric scores to typed ConfidenceLevel values
 * and exposes predicate helpers.
 *
 * Raw scores are NEVER exposed outside the engine boundary.
 * Callers always work with ConfidenceLevel.
 */

import type { ConfidenceLevel, ConfidenceScore, IntentCandidate } from '../types';

// ─── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS: Record<ConfidenceLevel, number> = {
  very_high: 90,
  high:      70,
  medium:    50,
  low:       30,
  unknown:   0,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/** Convert a raw 0–100 score to a typed ConfidenceLevel */
export function toConfidenceLevel(score: ConfidenceScore): ConfidenceLevel {
  if (score >= THRESHOLDS.very_high) return 'very_high';
  if (score >= THRESHOLDS.high)      return 'high';
  if (score >= THRESHOLDS.medium)    return 'medium';
  if (score >= THRESHOLDS.low)       return 'low';
  return 'unknown';
}

/** Returns true when the confidence is very_high or high */
export function isCertain(level: ConfidenceLevel): boolean {
  return level === 'very_high' || level === 'high';
}

/**
 * Returns true when the engine cannot confidently distinguish between
 * two or more competing intents and a clarification question would help.
 *
 * Conditions:
 *   - Primary confidence is medium or below, OR
 *   - Top two candidates are within 15 points of each other
 */
export function requiresClarification(candidates: readonly IntentCandidate[]): boolean {
  if (candidates.length === 0) return false;
  const primary = candidates[0];
  if (toConfidenceLevel(primary.score) === 'unknown') return false;   // nothing to clarify
  if (!isCertain(toConfidenceLevel(primary.score))) return true;
  if (candidates.length >= 2) {
    return (primary.score - candidates[1].score) < 15;
  }
  return false;
}

/**
 * Returns true when the conversation should be escalated to a human.
 *
 * Conditions:
 *   - Primary intent is human_representative, OR
 *   - Confidence is 'unknown' (engine has no idea), OR
 *   - Urgency is critical with unknown confidence
 */
export function shouldEscalate(
  primaryCategory: string,
  level:           ConfidenceLevel,
): boolean {
  if (primaryCategory === 'human_representative') return true;
  if (primaryCategory === 'complaint' && level === 'unknown') return true;
  return false;
}
