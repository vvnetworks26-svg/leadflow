/**
 * business-identity/modules/services-catalog.module.ts
 *
 * Lookup helpers over the ServiceCatalogItem array.
 * All functions are pure — no side effects, no DB calls.
 */

import type { ServiceCatalogItem } from '../types';

/** Returns only services where enabled === true and bookable === true */
export function listBookableServices(catalog: readonly ServiceCatalogItem[]): ServiceCatalogItem[] {
  return catalog.filter(s => s.enabled && s.bookable);
}

/** Returns only services where enabled === true and emergencyEligible === true */
export function listEmergencyServices(catalog: readonly ServiceCatalogItem[]): ServiceCatalogItem[] {
  return catalog.filter(s => s.enabled && s.emergencyEligible);
}

/**
 * Case-insensitive exact-name lookup.
 * Returns the first enabled match, or undefined.
 */
export function getServiceByName(
  catalog: readonly ServiceCatalogItem[],
  name: string,
): ServiceCatalogItem | undefined {
  const lower = name.toLowerCase();
  return catalog.find(s => s.enabled && s.name.toLowerCase() === lower);
}

/**
 * Fuzzy keyword match — returns services whose name or keywords contain
 * any word from the intent text.  Scored by number of keyword hits;
 * returns best match or undefined.
 */
export function matchServiceFromIntent(
  catalog: readonly ServiceCatalogItem[],
  intentText: string,
): ServiceCatalogItem | undefined {
  const words = intentText.toLowerCase().split(/\W+/).filter(Boolean);
  if (words.length === 0) return undefined;

  let bestScore  = 0;
  let bestService: ServiceCatalogItem | undefined;

  for (const service of catalog) {
    if (!service.enabled) continue;

    const haystack = [
      service.name.toLowerCase(),
      service.description.toLowerCase(),
      ...service.keywords.map(k => k.toLowerCase()),
    ].join(' ');

    const score = words.filter(w => haystack.includes(w)).length;
    if (score > bestScore) {
      bestScore   = score;
      bestService = service;
    }
  }

  return bestScore > 0 ? bestService : undefined;
}
