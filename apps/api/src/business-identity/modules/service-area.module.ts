/**
 * business-identity/modules/service-area.module.ts
 *
 * Encapsulates all service-area queries.
 * Stateless — all methods are pure functions over the ServiceArea config.
 */

import type { ServiceArea } from '../types';

/**
 * Returns true if the given location (ZIP, city, or county) is within
 * the configured service area.  Falls back to `true` when area checks
 * are disabled so the AI never silently rejects a customer.
 */
export function servesLocation(area: ServiceArea, location: string): boolean {
  if (!area.enabled) return true;

  const loc = location.trim().toLowerCase();

  if (area.zipCodes.some(z => z === loc)) return true;
  if (area.cities.some(c => c.toLowerCase() === loc)) return true;
  if (area.counties.some(c => c.toLowerCase() === loc)) return true;
  if (area.primaryCity.toLowerCase() === loc) return true;

  return false;
}

/**
 * Returns true if the location is definitively outside the service area.
 * Always false when area checks are disabled.
 */
export function isOutsideServiceArea(area: ServiceArea, location: string): boolean {
  if (!area.enabled) return false;
  return !servesLocation(area, location);
}

/**
 * Returns the travel fee (USD) for a given distance in miles,
 * or 0 if no rule applies.
 */
export function getTravelFee(area: ServiceArea, distanceMiles: number): number {
  for (const rule of area.travelFeeRules) {
    if (distanceMiles >= rule.minMiles && distanceMiles < rule.maxMiles) {
      return rule.feeUsd;
    }
  }
  return 0;
}
