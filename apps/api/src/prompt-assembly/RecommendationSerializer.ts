/**
 * prompt-assembly/RecommendationSerializer.ts
 *
 * Serializes recommendations into a prompt block.
 * Omits section entirely when recommendations are empty.
 * Pure function.
 */

import type { Recommendation } from '../ai/types';

export function serializeRecommendations(recs: readonly Recommendation[]): string {
  if (!recs || recs.length === 0) return '';

  const lines = ['[RECOMMENDATIONS]'];

  for (const rec of recs) {
    lines.push(`Product: ${rec.title}`);
    lines.push(`Why: ${rec.why}`);
    lines.push(`Fit Score: ${rec.fitScore}/100`);
    lines.push(`Urgency: ${rec.urgency}`);
    lines.push('');
  }

  lines.push('[/RECOMMENDATIONS]');
  return lines.join('\n').trim();
}
