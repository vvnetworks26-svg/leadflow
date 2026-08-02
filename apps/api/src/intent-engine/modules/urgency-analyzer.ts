/**
 * intent-engine/modules/urgency-analyzer.ts
 *
 * Analyzes urgency independently from intent.
 * A repair request can be normal or critical depending on context.
 * Pure function — no side effects.
 */

import type { UrgencyLevel } from '../types';

// ─── Urgency signals ──────────────────────────────────────────────────────────

const CRITICAL_SIGNALS = [
  'no heat', 'no cooling', 'no ac', 'no air conditioning',
  'burst pipe', 'flooding', 'water everywhere', 'gas leak',
  'carbon monoxide', 'electrical fire', 'sparks', 'smoke',
  'no power', 'power outage', 'freezing', 'pipes frozen',
  'sewage', 'raw sewage', 'roof collapsed', 'structural damage',
  'outlet sparking', 'sparking outlet', 'sparks from',
];

const EMERGENCY_SIGNALS = [
  'urgent', 'emergency', 'asap', 'right away', 'immediately',
  'right now', 'no hot water', 'no electricity', 'circuit breaker',
  'roof leak', 'active leak', 'water damage',
  '100 degrees', '110 degrees', '115 degrees', '118 degrees', '120 degrees',
  'very cold', 'freezing cold', 'extremely hot',
  'baby', 'infant', 'elderly', 'medical equipment',
];

const PRIORITY_SIGNALS = [
  'today', 'as soon as possible', 'soon', 'quickly',
  'not working', 'stopped working', 'broken',
  'before it gets worse', 'getting worse',
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine urgency from the customer's message.
 * Returns the highest urgency level detected.
 *
 * Hierarchy: critical > emergency > priority > normal
 */
export function analyzeUrgency(message: string): UrgencyLevel {
  const lower = message.toLowerCase();

  if (CRITICAL_SIGNALS.some(s => lower.includes(s)))  return 'critical';
  if (EMERGENCY_SIGNALS.some(s => lower.includes(s)))  return 'emergency';
  if (PRIORITY_SIGNALS.some(s => lower.includes(s)))   return 'priority';

  return 'normal';
}

/**
 * Returns the signals that triggered the urgency level.
 * Used in ResolvedIntent.reasoning for explainability.
 */
export function urgencySignals(message: string): string[] {
  const lower   = message.toLowerCase();
  const signals: string[] = [];

  for (const s of CRITICAL_SIGNALS)  if (lower.includes(s)) signals.push(`critical:"${s}"`);
  for (const s of EMERGENCY_SIGNALS) if (lower.includes(s)) signals.push(`emergency:"${s}"`);
  for (const s of PRIORITY_SIGNALS)  if (lower.includes(s)) signals.push(`priority:"${s}"`);

  return signals;
}
