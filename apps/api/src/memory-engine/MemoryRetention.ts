/**
 * memory-engine/MemoryRetention.ts
 * Assigns retention policies. Pure function.
 */
import type { RetentionPolicy, ImportanceLevel } from './MemoryTypes';

const FIELD_RETENTION: Record<string, RetentionPolicy> = {
  visitorName:       'permanent',
  phone:             'permanent',
  email:             'permanent',
  address:           '1_year',
  zip:               '1_year',
  bookingStatus:     'permanent',
  service:           '1_year',
  emergency:         '90_days',
  company:           '1_year',
  industry:          '1_year',
  budget:            '90_days',
  timeline:          '90_days',
  decisionMaker:     '1_year',
  employeeCount:     '1_year',
  painPoints:        '90_days',
  goals:             '90_days',
  objections:        '90_days',
  preferredTime:     '30_days',
  summary:           '1_year',
  servicesDiscussed: '90_days',
  questionsAnswered: 'session',
  location:          '1_year',
};

export function assignRetention(key: string, importance: ImportanceLevel): RetentionPolicy {
  const field = FIELD_RETENTION[key];
  if (field) return field;
  // Fallback by importance
  if (importance === 'critical')   return 'permanent';
  if (importance === 'high')       return '1_year';
  if (importance === 'medium')     return '90_days';
  if (importance === 'low')        return '30_days';
  return 'session';
}
