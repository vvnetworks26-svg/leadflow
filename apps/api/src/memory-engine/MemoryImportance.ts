/**
 * memory-engine/MemoryImportance.ts
 * Maps memory fields to importance levels. Pure function.
 */
import type { ImportanceLevel } from './MemoryTypes';

const IMPORTANCE_SCORES: Record<string, number> = {
  visitorName:       85,
  phone:             95,
  email:             88,
  address:           80,
  zip:               70,
  bookingStatus:     92,
  service:           82,
  emergency:         90,
  company:           72,
  industry:          65,
  budget:            75,
  timeline:          72,
  decisionMaker:     78,
  employeeCount:     60,
  painPoints:        68,
  goals:             65,
  objections:        70,
  preferredTime:     75,
  summary:           60,
  servicesDiscussed: 55,
  questionsAnswered: 40,
  location:          70,
};

export function scoreImportance(key: string, confidence: number): number {
  const base = IMPORTANCE_SCORES[key] ?? 50;
  // Confidence penalty: low confidence reduces importance
  const penalty = confidence < 50 ? Math.round((50 - confidence) * 0.3) : 0;
  return Math.max(0, Math.min(100, base - penalty));
}

export function toImportanceLevel(score: number): ImportanceLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'negligible';
}
