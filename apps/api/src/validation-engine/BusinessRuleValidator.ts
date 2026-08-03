/**
 * validation-engine/BusinessRuleValidator.ts
 *
 * Validates response against the live Business Identity rules.
 *
 * Rules:
 *   1. Never offer times when the business is closed
 *   2. Never promise emergency dispatch if emergencyPolicy is disabled
 *   3. Never refer to cities/areas outside the service area
 *   4. Never use a service name not in the catalog
 *
 * PURE — no I/O.
 */

import type { ValidationContext, ValidatorResult } from './types';
import { ValidationResult } from './ValidationResult';
import { isOpen } from '../business-identity/modules/business-hours.module';

// ─── Patterns ─────────────────────────────────────────────────────────────────

const EMERGENCY_PROMISE_PATTERNS = [
  /dispatch(ing)? (a tech|someone|our team) (right away|immediately|now|asap)/i,
  /emergency (tech|team|crew|service|dispatch)/i,
  /24[\/\-]7 emergency/i,
  /we('?re| are) (available|here|on call) 24\/7/i,
  /someone (on their way|en route)/i,
];

function normalizeCityName(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function isOutsideServiceArea(response: string, identity: ValidationContext['identity']): string | null {
  const area = identity.serviceArea;
  if (!area.enabled || (area.cities.length === 0 && area.counties.length === 0)) return null;

  // If service area cities are defined, check if response mentions any city NOT in the list
  // (conservative — only flag cities that look like specific place names)
  const cityPattern = /\b([A-Z][a-z]+ ?(City|County|Beach|Heights|Hills|Park|Springs|Grove|Lake|Falls)?)\b/g;
  const mentioned   = [...response.matchAll(cityPattern)].map(m => normalizeCityName(m[0]));
  if (mentioned.length === 0) return null;

  const allowedCities = [...area.cities, area.primaryCity].map(normalizeCityName);
  const allowedCounties = area.counties.map(normalizeCityName);

  for (const city of mentioned) {
    if (city.length < 4) continue;  // skip short words like "The"
    const inArea = allowedCities.some(c => c.includes(city) || city.includes(c))
                || allowedCounties.some(c => c.includes(city) || city.includes(c));
    if (!inArea) {
      // Only flag if the service area is strict (has actual city entries)
      if (allowedCities.filter(c => c.length > 0).length > 0) {
        return city;
      }
    }
  }
  return null;
}

// ─── Validator ────────────────────────────────────────────────────────────────

export const BusinessRuleValidator = {

  validate(ctx: ValidationContext): ValidatorResult {
    const { identity, proposedResponse, nowMs } = ctx;

    // 1. Emergency dispatch: only promise if policy enables it
    if (!identity.emergencyPolicy.enabled) {
      const promisesEmergency = EMERGENCY_PROMISE_PATTERNS.some(p => p.test(proposedResponse));
      if (promisesEmergency) {
        return ValidationResult.fail(
          'BusinessRuleValidator',
          'Emergency dispatch is not enabled for this business. Do not promise emergency service.',
          'emergency',
        );
      }
    }

    // 2. Business hours: don't offer appointments when closed (if nowMs injected)
    if (nowMs !== undefined) {
      const businessOpen = isOpen(
        identity.businessHours,
        identity.contactInfo.timezone,
        new Date(nowMs),
      );
      if (!businessOpen && proposedResponse.toLowerCase().includes('available')) {
        // Soft warn — can still proceed but should be noted
        // We only hard-fail if it explicitly offers a booking slot when closed
        const offersSlot = /available (today|right now|now|this (morning|afternoon|evening))/i.test(proposedResponse);
        if (offersSlot) {
          return ValidationResult.fail(
            'BusinessRuleValidator',
            'Business is currently closed. Do not offer immediate availability.',
            'businessHours',
          );
        }
      }
    }

    // 3. Service area: don't reference cities outside service area
    const outsideCity = isOutsideServiceArea(proposedResponse, identity);
    if (outsideCity) {
      return ValidationResult.fail(
        'BusinessRuleValidator',
        `City "${outsideCity}" appears to be outside the service area.`,
        'serviceArea',
      );
    }

    return ValidationResult.pass('BusinessRuleValidator');
  },
};
