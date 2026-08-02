/**
 * intent-engine/modules/intent-classifier.ts
 *
 * Rule-based intent classifier. Deterministic, no LLM dependency.
 * Scores every keyword rule against the input text and returns ranked candidates.
 *
 * Scoring algorithm:
 *   - Exact phrase match → weight × 3
 *   - Keyword match      → weight × 1  (per keyword hit)
 *   - Score normalised to 0–100
 */

import type { IntentCandidate, IntentKeywordRule } from '../types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classify the message against all rules and return all candidates with
 * scores > 0, sorted descending. An empty array means no intent was detected.
 */
export function classifyMessage(
  message: string,
  rules:   readonly IntentKeywordRule[],
): IntentCandidate[] {
  const lower = message.toLowerCase();
  const scored: IntentCandidate[] = [];

  for (const rule of rules) {
    const signals: string[] = [];
    let   raw     = 0;

    // Exact phrase matches (weight × 3)
    for (const phrase of rule.phrases) {
      if (lower.includes(phrase.toLowerCase())) {
        raw += rule.weight * 3;
        signals.push(`phrase:"${phrase}"`);
      }
    }

    // Keyword matches (weight × 1 per hit)
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        raw += rule.weight * 1;
        signals.push(`kw:"${kw}"`);
      }
    }

    if (raw > 0) {
      // Normalise: clamp to 0–100 using a soft scale
      const score = Math.min(100, Math.round(normalise(raw, rule)));
      scored.push({
        category:    rule.intent,
        subCategory: rule.subCategory,
        score,
        signals:     Object.freeze(signals),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map raw hit count to 0–100.
 * Uses a soft cap: full score (95) is reached at ≥5 signal points.
 */
function normalise(raw: number, rule: IntentKeywordRule): number {
  const maxExpected = rule.weight * (rule.phrases.length * 3 + rule.keywords.length);
  if (maxExpected === 0) return 0;
  const ratio = Math.min(1, raw / Math.max(maxExpected * 0.4, 1));
  return Math.round(30 + ratio * 65);   // 30 minimum when any signal fires; max 95
}
