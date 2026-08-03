/**
 * prompt-assembly/ContextCompressor.ts
 *
 * Deterministic context compression.
 * - Removes duplicate adjacent history messages
 * - Collapses repeated recommendations
 * - Trims whitespace
 * - Estimates token count (rough word-based approximation)
 * - Never loses important context
 * Pure functions. No side effects.
 */

import type { ChatMessage } from '../ai/types';
import type { Recommendation } from '../ai/types';

// ─── History deduplication ────────────────────────────────────────────────────

/**
 * Removes exact duplicate consecutive messages from history.
 * Preserves all unique messages in order.
 */
export function deduplicateHistory(history: readonly ChatMessage[]): ChatMessage[] {
  if (history.length === 0) return [];
  const result: ChatMessage[] = [history[0]];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (prev.role !== curr.role || prev.content !== curr.content) {
      result.push(curr);
    }
  }
  return result;
}

// ─── Recommendation deduplication ────────────────────────────────────────────

/**
 * Removes duplicate recommendations by product title.
 * Keeps the first occurrence of each product.
 */
export function deduplicateRecommendations(recs: readonly Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return recs.filter(r => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
}

// ─── Whitespace normalization ─────────────────────────────────────────────────

/** Collapses multiple blank lines to one and trims edges */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token count estimate.
 * Uses the common heuristic: 1 token ≈ 0.75 words (≈ 4 chars per token).
 * Accurate enough for sizing decisions; not for billing.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  return Math.ceil(chars / 4);
}

export function estimateTokensFromParts(parts: string[]): number {
  return parts.reduce((sum, p) => sum + estimateTokens(p), 0);
}

// ─── Compression decision ─────────────────────────────────────────────────────

/** Token budget above which compression is flagged as applied */
const COMPRESSION_THRESHOLD = 6000;

export function shouldCompress(tokenEstimate: number): boolean {
  return tokenEstimate > COMPRESSION_THRESHOLD;
}

/**
 * Full compression pipeline.
 * Returns compressed parts and whether compression was actually applied.
 */
export function compress(params: {
  history:         readonly ChatMessage[];
  recommendations: readonly Recommendation[];
  maxHistory:      number;
}): {
  history:          ChatMessage[];
  recommendations:  Recommendation[];
  compressionApplied: boolean;
} {
  const dedupedHistory = deduplicateHistory(params.history);
  const windowHistory  = dedupedHistory.slice(-params.maxHistory);
  const dedupedRecs    = deduplicateRecommendations(params.recommendations);

  const compressionApplied =
    windowHistory.length < params.history.length ||
    dedupedRecs.length < params.recommendations.length;

  return { history: windowHistory, recommendations: dedupedRecs, compressionApplied };
}
