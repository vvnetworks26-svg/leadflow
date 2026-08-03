/**
 * memory-engine/MemoryClassifier.ts
 * Classifies memory fields into domains. Pure function.
 */
import type { MemoryDomain } from './MemoryTypes';

const DOMAIN_MAP: Record<string, MemoryDomain> = {
  visitorName:   'identity',
  phone:         'identity',
  email:         'identity',
  address:       'property',
  zip:           'property',
  company:       'business',
  industry:      'business',
  employeeCount: 'business',
  budget:        'business',
  timeline:      'business',
  decisionMaker: 'business',
  service:       'preference',
  preferredTime: 'preference',
  emergency:     'behavioral',
  painPoints:    'behavioral',
  goals:         'behavioral',
  objections:    'relationship',
  bookingStatus: 'relationship',
  servicesDiscussed: 'relationship',
  questionsAnswered: 'behavioral',
  summary:       'behavioral',
  location:      'property',
};

export function classifyField(key: string): MemoryDomain {
  return DOMAIN_MAP[key] ?? 'behavioral';
}

export function classifyAllFields(keys: string[]): Record<string, MemoryDomain> {
  return Object.fromEntries(keys.map(k => [k, classifyField(k)]));
}
