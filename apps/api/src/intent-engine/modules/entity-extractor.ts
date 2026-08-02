/**
 * intent-engine/modules/entity-extractor.ts
 *
 * Extracts structured entities from the customer's first message.
 * Pure function — no side effects.
 * Entities are stored separately from conversation memory.
 */

import type { ExtractedEntity, EntityType } from '../types';

// ─── Entity patterns ──────────────────────────────────────────────────────────

const EQUIPMENT_TERMS: Record<string, string> = {
  'air conditioner': 'Air Conditioner',
  'air conditioning': 'Air Conditioning',
  ' ac ': 'Air Conditioner',
  ' a/c ': 'Air Conditioner',
  'furnace': 'Furnace',
  'heating system': 'Heating System',
  'heat pump': 'Heat Pump',
  'boiler': 'Boiler',
  'water heater': 'Water Heater',
  'water tank': 'Water Tank',
  'roof': 'Roof',
  'gutter': 'Gutter',
  'plumbing': 'Plumbing',
  'pipe': 'Pipe',
  'faucet': 'Faucet',
  'toilet': 'Toilet',
  'drain': 'Drain',
  'electrical panel': 'Electrical Panel',
  'circuit breaker': 'Circuit Breaker',
  'outlet': 'Outlet',
  'wiring': 'Wiring',
  'pest': 'Pest',
  'rodent': 'Rodent',
  'termite': 'Termite',
};

const TIME_RE   = /\b(today|tomorrow|tonight|this (morning|afternoon|evening|weekend|week)|next (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}(:\d{2})?\s*(am|pm))\b/gi;
const PHONE_RE  = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
const ZIP_RE    = /\b\d{5}(?:-\d{4})?\b/g;
const NAME_RE   = /(?:i'?m|my name is|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
const CITY_RE   = /(?:in|from|at|near)\s+([A-Z][a-zA-Z\s]{2,20}?)(?:\s*,|\s+\d{5}|\s*$)/g;

// Service terms mapped to normalised names
const SERVICE_TERMS: Record<string, string> = {
  'repair':        'Repair',
  'fix':           'Repair',
  'installation':  'Installation',
  'install':       'Installation',
  'replace':       'Replacement',
  'replacement':   'Replacement',
  'maintenance':   'Maintenance',
  'tune-up':       'Maintenance',
  'tune up':       'Maintenance',
  'cleaning':      'Cleaning',
  'inspection':    'Inspection',
  'inspect':       'Inspection',
  'estimate':      'Estimate',
  'quote':         'Estimate',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract all recognisable entities from the message.
 * Returns a deduplicated, immutable array of entities.
 */
export function extractEntities(
  message: string,
  availableServices?: readonly string[],
): readonly ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const lower = message.toLowerCase();

  // Equipment
  for (const [term, label] of Object.entries(EQUIPMENT_TERMS)) {
    if (lower.includes(term)) {
      entities.push(makeEntity('equipment', label, term));
    }
  }

  // Services (from our known service terms)
  for (const [term, label] of Object.entries(SERVICE_TERMS)) {
    if (lower.includes(term)) {
      entities.push(makeEntity('service', label, term));
    }
  }

  // Available services from the business catalog (exact name match)
  if (availableServices) {
    for (const svc of availableServices) {
      if (lower.includes(svc.toLowerCase())) {
        entities.push(makeEntity('service', svc, svc));
      }
    }
  }

  // Time expressions
  const timeMatches = [...message.matchAll(TIME_RE)];
  for (const m of timeMatches) {
    entities.push(makeEntity('time', m[0].trim(), m[0]));
  }

  // Phone numbers
  const phoneMatches = [...message.matchAll(PHONE_RE)];
  for (const m of phoneMatches) {
    entities.push(makeEntity('phone', m[0].replace(/\D/g, '').replace(/^1/, ''), m[0]));
  }

  // ZIP codes
  const zipMatches = [...message.matchAll(ZIP_RE)];
  for (const m of zipMatches) {
    entities.push(makeEntity('zip', m[0], m[0]));
  }

  // Names
  const nameMatches = [...message.matchAll(NAME_RE)];
  for (const m of nameMatches) {
    if (m[1]) entities.push(makeEntity('name', m[1].trim(), m[0]));
  }

  // Cities
  const cityMatches = [...message.matchAll(CITY_RE)];
  for (const m of cityMatches) {
    if (m[1]) entities.push(makeEntity('city', m[1].trim(), m[0]));
  }

  // Deduplicate by type+value
  return Object.freeze(dedup(entities));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntity(type: EntityType, value: string, raw: string): ExtractedEntity {
  return Object.freeze({ type, value, raw });
}

function dedup(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  return entities.filter(e => {
    const key = `${e.type}:${e.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
